#import <dispatch/dispatch.h>
#include <stdint.h>

extern void planeStartTray(uintptr_t handle);

void planeStartTrayOnMainThread(uintptr_t handle) {
    dispatch_async(dispatch_get_main_queue(), ^{
        planeStartTray(handle);
    });
}
