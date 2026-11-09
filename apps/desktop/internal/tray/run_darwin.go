package tray

/*
#include <stdint.h>
void planeStartTrayOnMainThread(uintptr_t handle);
*/
import "C"

import (
	"runtime/cgo"

	"fyne.io/systray"
)

func runTray(onReady, onExit func()) {
	// Wails owns NSApplication and its event loop. Initialize only the status
	// item, on AppKit's main thread, without replacing the Wails app delegate.
	start, _ := systray.RunWithExternalLoop(onReady, onExit)
	C.planeStartTrayOnMainThread(C.uintptr_t(cgo.NewHandle(start)))
}

//export planeStartTray
func planeStartTray(handle C.uintptr_t) {
	callback := cgo.Handle(handle)
	start := callback.Value().(func())
	callback.Delete()
	start()
}
