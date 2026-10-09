// WebHID 的最小类型声明。
//
// 为什么需要：TypeScript 的 `lib.dom.d.ts` **不包含 WebHID**（它的类型在
// `@types/w3c-web-hid` 这个 DefinitelyTyped 包里）。开启 `strict` 后，
// 所有接�� HIDDevice 的函数参数都会退化成隐式 any —— 那等于把刚打开的类型通道又关掉。
//
// 为什么手写而不装包：本轮明确承诺「不引入新依赖」。这里的四个接口就是规范 IDL
// 的子集，形状取自 https://www.w3.org/TR/webhid/ ，不是自创。
// 若将来允许引入类型包，删掉本文件、改加 devDependency `@types/w3c-web-hid` 即可
// （决策记录见 DECISIONS.md「WebHID 类型声明」）。

interface HIDReport {
  reportId: number;
  items: any[];
}

interface HIDCollection {
  usagePage: number;
  usage: number;
  inputReports: HIDReport[];
  outputReports: HIDReport[];
  featureReports: HIDReport[];
}

interface HIDDevice extends EventTarget {
  readonly opened: boolean;
  readonly collections: HIDCollection[];
  readonly productId: number;
  readonly vendorId: number;
  readonly productName: string;
  open(): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
  sendFeatureReport(reportId: number, data: BufferSource): Promise<void>;
  receiveFeatureReport(reportId: number, size?: number): Promise<DataView>;
}

interface HIDInputReportEvent extends Event {
  readonly device: HIDDevice;
  readonly reportId: number;
  readonly data: DataView;
}

interface HIDDeviceRequestOptions {
  filters: Array<{ vendorId?: number; productId?: number; usagePage?: number; usage?: number }>;
  acceptAllDevices?: boolean;
}

interface HID {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: HIDDeviceRequestOptions): Promise<HIDDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (e: HIDConnectionEvent) => void): void;
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice;
}

interface Navigator {
  readonly hid: HID;
}
