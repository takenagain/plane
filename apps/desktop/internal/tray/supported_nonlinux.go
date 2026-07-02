//go:build !linux

package tray

// Supported reports whether the legacy getlantern systray can run on this OS.
func Supported() bool {
	return true
}
