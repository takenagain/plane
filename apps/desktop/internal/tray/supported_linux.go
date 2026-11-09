//go:build linux

package tray

import "os"

// Supported reports whether the system tray can run on this OS.
//
// On Linux, the tray's standalone loop calls gtk_init from a background goroutine while
// Wails already owns the GTK main loop, which aborts the process (SIGABRT in
// nativeLoop). Tray is opt-in via PLANE_DESKTOP_ENABLE_TRAY=1 until we migrate
// to a Wails-native system tray integration.
func Supported() bool {
	return os.Getenv("PLANE_DESKTOP_ENABLE_TRAY") == "1"
}
