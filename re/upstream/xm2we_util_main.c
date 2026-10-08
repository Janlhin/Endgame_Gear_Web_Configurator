#include <stdio.h>

#include <libusb-1.0/libusb.h>

#define TRUE  ((1))
#define FALSE ((0))


#define VID ((0x3367))
#define PID ((0x1961))

void set_report(libusb_device_handle *dev_handle);

int error(int code, char* msg) {
    fprintf(stderr, "%s", msg);
    return code;
}

int main() {
    libusb_device **dev_list = NULL;
    libusb_device_handle *dev_handle = NULL;
    ssize_t dev_count = 0;
    int dev_found = 0;
    struct libusb_device_descriptor dev_descriptor;

    libusb_init(NULL);
    dev_count = libusb_get_device_list(NULL, &dev_list);
    
    if (dev_count < 0){
        return error(-1, "ERROR: device list not recieved\n");        
    }
    
    for (unsigned int i = 0; i < dev_count; ++i) {
        libusb_device *dev = dev_list[i];
        libusb_get_device_descriptor(dev, &dev_descriptor);
        if (dev_descriptor.idProduct == PID && dev_descriptor.idVendor == VID) {
            libusb_open(dev_list[i], &dev_handle);
            printf("device found\n");
            break;
        }
    }

    if (dev_handle == NULL) {
        return error(-1, "ERROR: NULL dev handle");
    }
        
    libusb_detach_kernel_driver(dev_handle, 0);
    libusb_claim_interface(dev_handle, 0);

    set_report(dev_handle);
       
    libusb_release_interface(dev_handle, 0);
    libusb_attach_kernel_driver(dev_handle, 0);
    libusb_close(dev_handle);
    libusb_exit(NULL); 
    return 0;
}

void set_report(libusb_device_handle *dev_handle) {
    // direction: host-to-device 0b0.......
    // type: class               0b.01.....
    // recipient: interface      0b...00001
    const uint8_t request_type = 0b00100001; // 0x21
    const uint8_t request = 0x09; // type: SET_REPORT (0x09)
    const uint16_t value = 0x0308; // report id: 0x08, feature (0x03)
    const uint16_t index = 0x0001;
    unsigned char data[] = {
        0x08,
        0x04, // right: 0x03, left: 0x04 
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 
        0x49 // checksum?
    };

    const unsigned int timeout = 10;
    
    libusb_control_transfer(dev_handle, request_type, request, value, index, data, 2, timeout);
}

// endpoints?
// ennumerate stuff and then figure it out
    
