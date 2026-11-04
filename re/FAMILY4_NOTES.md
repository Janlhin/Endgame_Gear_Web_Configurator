# 第四协议族：XM1r / OP1 / OP1 RGB（VID 0x3367，usagePage 0xFFA1）

> 2026-10-09 从**官方 Electron 工具**的未打包源码中提取。本工具**只识别、不通信**。
> 结论：该族与已知三族（4k 无线 / XM1 / XM2we）**没有任何共同点**，是一套独立的第四协议。

## 0. 工具来源与提取方法（可复现）

官方 CDN 直连可用（不限流），两个包都是 **Inno Setup**（7-Zip 解不开，Inno 用 `innoextract` 才能静态解）。

| 型号 | 工具 | CDN 路径 |
|---|---|---|
| XM1r | V1.2.2 beta | `https://img.endgamegear.com/products/xm1r/downloads/xmr1r-configuration-software-1.2.2_beta.zip` |
| OP1 / OP1 RGB | 1.6.400 | `https://img.endgamegear.com/downloads/Endgame-Gear-Configuration-Software-OP1-and+OP1-RGB-1.6.400.exe` |

**提取方式**：Inno Setup 支持静默指定目录安装，装到临时目录后 `resources/app` 是
**未打包的 JS 源码**（Angular + Electron，连 source map 都有）：

```batch
ToolOP1.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART /NOICONS /DIR=<tmp>
# 落地：<tmp>\EndgameGearConfigurationSoftware.exe  +  resources\app\main-es2015.js(.map)
```

相同方法在 **WE 系列工具**上取到了 `Cfg.ini`（见 `PROTOCOL_NOTES.md` 的 WE 一节）。

## 1. 设备表（硬编码在 `main-es2015.js`，非配置文件）

```js
// XM1r_Controller 侧
if (_deviceHID.productId != 0x1903 || _deviceHID.vendorId != 0x3367) continue;
if (_deviceHID.usagePage != 0xFFA1 || _deviceHID.usage != 0x00A5) continue;

// OP1 / OP1 RGB 侧
if ((_deviceHID.productId != 0x1903 && _deviceHID.productId != 0x1905
  && _deviceHID.productId != 0x1906 && _deviceHID.productId != 0x1910)
  || _deviceHID.vendorId != 0x3367) continue;
if (/Linux/i.test(userAgent)) { if (i != 3) continue; }          // Linux 按接口序号
else if (_deviceHID.usagePage != 0xFFA1 || _deviceHID.usage != 0x00A5) continue;
```

| 型号 | VID | PID | 接口 |
|---|---|---|---|
| **XM1r** | `0x3367` | **`0x1903`** | `UP:0xFFA1 / U:0x00A5` |
| **OP1 / OP1 RGB** | `0x3367` | **`0x1903` / `0x1905` / `0x1906` / `0x1910`** | 同上 |

⚠️ XM1r 与 OP1 共用 PID `0x1903`（两家工具都认它）—— 说明二者是**同一硬件平台的不同外形**。
我们的 WebHID 过滤器只看 `0xFF01/0xFF02`，**永远看不到它们**；现已补上 `0xFFA1` 这一项，
目的仅是让用户在选择器里能看到设备并收到「已识别但不支持」的明确说明。

## 2. 包格式（64 字节定长，与三族都不同）

```js
var OS_PACKET_ADJUST = 1;            // win32
var OS_DATA_SIZE     = 64 + OS_PACKET_ADJUST;   // 65
var OS_COMTYPE_OFFSET= 1 + OS_PACKET_ADJUST;    // 2  → 命令
var OS_PACKETID_OFFSET=2 + OS_PACKET_ADJUST;    // 3  → 包序号
var OS_PAY_LOAD_INDEX= 3 + OS_PACKET_ADJUST;    // 4  → 载荷起点
var PAYLOAD_SIZE     = 59;
var REPORT_LENGTH    = 64;
var MAX_WRITE_RETRIES = 10, MAX_READ_RETRIES = 10;
```

传输原语（node-hid）：

```js
device.HID_Device.sendFeatureReport(Array.from(packetOut));      // packetOut[0] = reportId
device.HID_Device.getFeatureReport(0, OS_DATA_SIZE);             // reportId 0，固定长度
```

**连接后必须先用口令握手**，之后才响应查询：

```js
var szPASSWORD = Buffer.from('GEGJGYIKDCGBE9DWDKB27EAA7K9Z5J1P');   // 32 字节
szPASSWORD.copy(packetOut, OS_PAY_LOAD_INDEX, 0, 32);
Custom_HID_SendDataToDevice(COMTYPE.kComSetPasswd, ctx);
Custom_HID_SendDataToDevice(COMTYPE.kComQueryFirmwareVersion, ctx);
FWARE_VER_MAJOR = packetIn[OS_PAY_LOAD_INDEX];      // [4]
FWARE_VER_MINOR = packetIn[OS_PAY_LOAD_INDEX + 1];
FWARE_VER_BUILD = packetIn[OS_PAY_LOAD_INDEX + 2];
```

**重试策略**：发送与读取各最多 10 次（`MAX_WRITE_RETRIES` / `MAX_READ_RETRIES`）——
比 4k 族的 4 次更宽松，说明该族时序更松。

## 3. 命令表（COMTYPE，54 条，从 TS 数值枚举完整恢复）

| # | 命令 | # | 命令 |
|---|---|---|---|
| 1 | `kComLight` | 28 | `kComQueryExePathDataPacket` |
| 2 | `kComQueryLight` | 29 | `kComSetSerialTime` |
| 3 | `kComMouse` | 30 | `kComQuerySerialTime` |
| 4 | `kComQueryMouse` | 31 | `kComQueryMacroSetup` |
| 5 | `kComKeyboard` | 32 | `kComQueryMacroDataPacket` |
| 6 | `kComQueryKeyboard` | 33 | `kComQueryNameSetup` |
| 7 | `kComLCD` | 34 | `kComNameSetup` |
| 8 | `kComFirmwareDlSetup` | 35 | `kComclearFlash` |
| 9 | `kComFirmwareDataPacket` | 36 | `kComsaveSettings` |
| 10 | `kComMacroDlSetup` | 37 | `kComresetMouse` |
| 11 | `kComMacroDataPacket` | 38 | `kComcloseMouse` |
| 12 | `kComActivateProfile` | 39 | `kComQueryMemoryData` |
| 13 | `kComQueryProfile` | 40 | `kComSetLedEffect` |
| 14 | `kComSetMacroKey` | 41 | `kComQueryScanData` |
| 15 | `kComQueryMacroKey` | 42 | `kComQueryMeasurementData` |
| 16 | `kComSetDefaultExePage` | 43 | `kComSetLedGain` |
| 17 | `kComQueryFirmwareVersion` | 44 | `kComSetBackgroundEffect` |
| 18 | `kComResetFirmware` | 45 | `kComSetSyncronizeLEDStart` |
| 19 | `kComSetPasswd` | 46 | `kComGetSupporters` |
| 20 | `kComAck` | 47 | `kComGetInfo` |
| 21 | `kComResponse` | 48 | `kComFirmwareUpgrade` |
| 22 | `kComWriteFlash` | 49 | `kComFirmwareSetup` |
| 23 | `kComSetName` | 50 | `kComFirmwareUpload` |
| 24 | `kComExePathSetup` | 51 | `kComQueryProfileData` |
| 25 | `kComExePathDataPacket` | 52 | `kComSetProfileData` |
| 26 | `kComQueryName` | 53 | `kComQueryAnalogData` |
| 27 | `kComQueryExePathSetup` | 54 | `kComLast`（哨兵） |

⚠️ 该族有 `kComFirmwareUpgrade` / `kComWriteFlash` / `kComclearFlash` 这类**改固件**的命令，
以及 `kComExePath*`（往设备写"可执行文件路径"）——**绝不能在未完全理解前试发任何报文**。

## 4. 本工具的处理方式

- **识别**：连接过滤器加入 `{vendorId: 0x3367, usagePage: 0xFFA1, usage: 0x00A5}`；
  PID 命中 `0x1903/0x1905/0x1906/0x1910` 时标记为 `family4`。
- **界面**：`layout.ts` 的 `"unsupported"` 布局 —— **只显示一张设备信息卡**，
  显示型号名与原因，无任何可操作控件。
- **写入**：`guard4k()` 对 `family4` 直接抛错；任何时候都不会发送报文。
- **指针集合无条件拒绝；键盘集合仅在与已知厂商配置集合共存时放行并警告**
  （2026-10-20 起，见 `connect.ts` 的 `isSafeToOpen`：Chrome 155 合并同接口集合，
  有线复合鼠标必然带键盘集合）。

## 5. 若将来要支持该族，起点在哪

1. 协议骨架已完整（包格式 + 54 条命令 + 口令），**不需要再逆向协议层**；
2. 缺的是**配置数据的字段布局**：`kComQueryProfileData` 返回的
   profile 结构体各字段偏移（相当于 4k 的 blob 布局）。做法与 XM1 相同：
   真机读一次 → 官方软件改一个值 → 再读 → 差分；
3. 该族有**写入固件的命令**，所以必须比照 XM1 建立「发送白名单」，
   只放行已确认的 profile 读写命令，其余一律拦截。

脚本与产物：`re/upstream/vidpid_hunt.py`（通用 VID/PID 猎取）、
`_os_comtype.txt`（枚举导出）、`_more_install.txt` / `_we_install.txt`（静默安装记录）。
原始 exe 与应用目录体积过大，已清理（可按下表 URL 重新下载）。

## 6. 与 OpenMouse 的对照（2026-11-04）

来源：`OpenMouse-Project/mouse-protocol` 的 `src/endgame-gear/ot.ts`（AGPL-3，**只取事实，不取代码**）。

### 6.1 这次对照的性质：补全，不是验证

两边**来源相同**——都是从官方未打包的 ``main-es2015.js`` 里取出的常量。因此"一致"只说明同一份产物被读了两次，**不能当作正确性证据**。对方模块头注释原话：

> *"None of this has been exercised on hardware yet: every entry is recognition-grade, not hardware-verified."*

所以下文的字段表**只能降低"抄错"的概率，不能降低"理解错"的概率**。真机验证仍然是唯一出口。

### 6.2 补上了 §5 里说"缺"的那块：profile 结构体（118 字节）

我们此前停在"缺 `kComQueryProfileData` 返回的结构体布局"。对方已解出（`OT_EFFECT_SIZE = 118`）：

| 偏移 | 字段 | 说明 |
|---|---|---|
| 0 | transferFlags | |
| 1 | profileIndex | |
| 2 | activeProfile | |
| 3 | maxProfile | |
| 4 | cpi | 4 × u16 LE |
| 12 | profileFlags | u32 LE |
| 16 | cpiIndex | |
| 17 | pollrateIndex | 0=1000 / 1=500 / 2=250 / 3=125 |
| 18 | pollRates | 3 × u8 |
| 21 | sensitivityX | |
| 22 | sensitivityY | |
| **23** | **dcuThreshold** | **即抬离距离（LOD）** |
| 24 | acceleration | |
| 25 | angleSnap | |
| 26 | jitterCorrection | |
| 27 | red | 4 × u8（每档 CPI 一个） |
| 31 | green | 4 × u8 |
| 35 | blue | 4 × u8 |
| 39 | buttonRemap | 7 × u8 |
| 46 | lcdBrightness | |
| 47 | lcdContrast | |
| 48 | winPointerSpeed | |
| 50 | hidUsage | 7 × u16 LE |
| 64 | modifier | 7 × u8 |
| 71 | profileName | 32 字节 UTF-16，NUL 填充 |
| 103 | cpiY | 4 × u16 LE |
| 111 | wirelessMode | |
| 112–117 | rgbMode / R / G / B / 亮度 / 速度 | 仅 OP1 RGB |

`profileFlags` 位：angleSnapping `1<<3`、motionSyncSmooth `1<<5`、rippleControl `1<<6`、
rgbEnabled `1<<12`、motionSyncResponsive `1<<14`、slamClickFilter `1<<15`。

分块（`OT_PROFILE_BLOCK`）：0 main(0,50) / 1 keyboard(50,21) / 2 name(71,32) /
3 cpiY(103,8) / 4 wireless(111,1) / 6 rgb(112,6)。无线遥测在 block-4 回复 `payload[4]` 起：
`+0` mode、`+1` batteryRaw（`&0x7f` 为电量、`&0x80` 为充电位）、`+2/+3` 鼠标/接收器档。

### 6.3 ⚠️ 会让握手必然失败的坑：偏移体系差一个 reportId 字节

我们的 §2 记录的是 **node-hid / Windows 视角**，偏移量里含 `packetOut[0] = reportId`：

```text
OS_COMTYPE_OFFSET = 1 + 1 = 2      // 命令
OS_PACKETID_OFFSET = 2 + 1 = 3     // 包序号
OS_PAY_LOAD_INDEX  = 3 + 1 = 4     // 载荷起点
```

而 **WebHID 的 `sendFeatureReport(reportId, data)` 里 `data` 不含 reportId**，所以正确的
报告内偏移是 **1 / 2 / 3**（对方用的正是这一组）。若照我们笔记里的 2/3/4 去填，
口令 32 字节会整体后移一格 —— 设备不会回 ACK，表现为「连上了但什么都不响应」。

**实现时必须用 1/2/3。** 同理 `PAYLOAD_SIZE`：厂商侧写 59（`OS_DATA_SIZE 65 − PAY_LOAD_INDEX 4` 之外的保留），
WebHID 侧可用 61（`64 − 3`）；固件分块两边都是 **57**。

### 6.4 对方自己标注为「推断」的项，不要当结论

- 充电位（bit7）来自**应用层计时逻辑推断**，非线路观测；
- LOD 只认 1/2，依据是官方工具提示文案只写了 1 mm / 2 mm；
- 轮询率索引→Hz 来自厂商结构体注释；
- CPI 上限 19000（XM1r 页面）/ 26000，步进 50（>10000 时 100）；
- `0x1910` 被明确标为**故意不支持**：官方工具用 XM2w 美术资源给它开过无线页
  （电量/充电），但全应用找不到型号名 —— 我们笔记里列了该 PID 却没说它是无线款，此处补上。

### 6.5 危险命令白名单（对方也只做只读）

该族存在 `kComFirmwareUpgrade(48)` / `kComFirmwareSetup(49)` / `kComFirmwareUpload(50)` /
`kComWriteFlash(22)` / `kComclearFlash(35)` / `kComresetFirmware(18)` / `kComExePath*(24/25/27)`。

对方连**写回 profile 都没做**（敏感度、加速、jitter、LED、按键映射全部只读解码，无 writer）。
这与我们 §4 的红线一致。**任何实现都必须先建发送白名单，只放行
`kComSetPasswd(19)` / `kComQueryFirmwareVersion(17)` / `kComQueryProfileData(51)` 这类只读命令。**

### 6.6 结论

- 协议骨架（包格式 + 54 条命令 + 口令 + **结构体布局**）现在**齐了**，`kComQueryProfileData` 的
  解析不再是空白；
- 但仍**零真机**，且两边同源，所以下一步只能是有设备的人读一次真机 blob 做差分
  （与 XM1 同一套方法：读 → 官方软件改一项 → 再读）；
- 优先级取决于项目走向（若走「交给 OpenMouse」，这些事实应直接进 issue，而不是自己再实现一遍）。
