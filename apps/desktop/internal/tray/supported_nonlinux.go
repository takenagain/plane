//go:build !linux

package tray

// Supported reports whether the system tray can run on this OS.
func Supported() bool {
	return true
}
