//go:build !darwin

package tray

import "fyne.io/systray"

func runTray(onReady, onExit func()) {
	systray.Run(onReady, onExit)
}
