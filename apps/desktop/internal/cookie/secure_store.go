package cookie

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"

	"github.com/zalando/go-keyring"
)

const (
	cookieStoreKey      = "plane-desktop-session"
	keyringService      = "plane-desktop"
	encryptedCookieFile = "cookies.enc"
	storageKeyFile      = ".storage-key"
)

// SecureStore persists opaque session bytes using OS-native storage when available.
type SecureStore interface {
	Save(data []byte) error
	Load() ([]byte, error)
	Delete() error
}

type keyringStore struct{}

func (keyringStore) Save(data []byte) error {
	return keyring.Set(keyringService, cookieStoreKey, string(data))
}

func (keyringStore) Load() ([]byte, error) {
	value, err := keyring.Get(keyringService, cookieStoreKey)
	if err != nil {
		return nil, err
	}
	return []byte(value), nil
}

func (keyringStore) Delete() error {
	return keyring.Delete(keyringService, cookieStoreKey)
}

type encryptedFileStore struct {
	path    string
	keyPath string
}

func newEncryptedFileStore(configDir string) *encryptedFileStore {
	return &encryptedFileStore{
		path:    filepath.Join(configDir, encryptedCookieFile),
		keyPath: filepath.Join(configDir, storageKeyFile),
	}
}

func (s *encryptedFileStore) machineKey() ([]byte, error) {
	if data, err := os.ReadFile(s.keyPath); err == nil && len(data) >= 32 {
		return data[:32], nil
	}

	key := make([]byte, 32)
	if _, err := io.ReadFull(rand.Reader, key); err != nil {
		return nil, fmt.Errorf("generate storage key: %w", err)
	}

	if err := os.MkdirAll(filepath.Dir(s.keyPath), 0700); err != nil {
		return nil, err
	}
	if err := os.WriteFile(s.keyPath, key, 0600); err != nil {
		return nil, err
	}

	return key, nil
}

func (s *encryptedFileStore) Save(data []byte) error {
	key, err := s.machineKey()
	if err != nil {
		return err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return err
	}

	ciphertext := gcm.Seal(nonce, nonce, data, nil)
	encoded := base64.StdEncoding.EncodeToString(ciphertext)

	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return err
	}

	tempPath := s.path + ".tmp"
	if err := os.WriteFile(tempPath, []byte(encoded), 0600); err != nil {
		return err
	}

	return os.Rename(tempPath, s.path)
}

func (s *encryptedFileStore) Load() ([]byte, error) {
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}

	key, err := s.machineKey()
	if err != nil {
		return nil, err
	}

	ciphertext, err := base64.StdEncoding.DecodeString(string(raw))
	if err != nil {
		return nil, err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return nil, errors.New("encrypted cookie payload too short")
	}

	nonce, payload := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, payload, nil)
	if err != nil {
		return nil, fmt.Errorf("decrypt cookie store: %w", err)
	}

	return plaintext, nil
}

func (s *encryptedFileStore) Delete() error {
	if err := os.Remove(s.path); err != nil && !os.IsNotExist(err) {
		return err
	}
	return nil
}

func newSecureStore(configDir string) SecureStore {
	return &fallbackSecureStore{
		primary:  keyringStore{},
		fallback: newEncryptedFileStore(configDir),
	}
}

type fallbackSecureStore struct {
	primary  SecureStore
	fallback SecureStore
}

func (s *fallbackSecureStore) Save(data []byte) error {
	if err := s.primary.Save(data); err == nil {
		_ = s.fallback.Delete()
		return nil
	}
	return s.fallback.Save(data)
}

func (s *fallbackSecureStore) Load() ([]byte, error) {
	data, err := s.primary.Load()
	if err == nil {
		return data, nil
	}
	return s.fallback.Load()
}

func (s *fallbackSecureStore) Delete() error {
	primaryErr := s.primary.Delete()
	fallbackErr := s.fallback.Delete()
	if primaryErr != nil && !errors.Is(primaryErr, keyring.ErrNotFound) {
		return primaryErr
	}
	if fallbackErr != nil && !os.IsNotExist(fallbackErr) {
		return fallbackErr
	}
	return nil
}

// storageDir returns the plane-desktop config directory.
func storageDir(cookiePath string) string {
	return filepath.Dir(cookiePath)
}

// legacyFingerprint helps detect migrated plaintext without logging cookie values.
func legacyFingerprint(data []byte) string {
	sum := sha256.Sum256(data)
	return base64.RawURLEncoding.EncodeToString(sum[:8])
}
