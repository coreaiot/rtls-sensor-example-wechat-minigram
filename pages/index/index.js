// index.js
// 获取应用实例
const app = getApp()
const COREAIOT_MANUFACTURER_ID = 0x000d
const COREAIOT_MANUFACTURER_SPECIFIC_DATA_LENGTH = 27
const COREAIOT_NUMBER_OF_SERVICE_UUIDS = 13

Page({
  data: {
    busy: false,
    started: false,
    wasi: null,
    ready: false,
    systemInfo: null,
    bleAdapter: null,
    ble: null
  },
  // 事件处理函数
  onClick() {
    this.setData({
      busy: true
    })
    if(this.data.started) {
      this.stop()
    } else {
      this.start()
    }
  },
  start() {
    wx.createBLEPeripheralServer({
      success: res => {
        const id = 0x1234
        const alarm = 0
        const battery = 0
        let advertiseRequest
        if (this.data.systemInfo.platform === 'ios') {
          const ptr = this.data.wasi.instance.exports.coreaiot_generate_service_uuids(
            id,
            alarm,
            battery
          )
          const buffer = this.data.wasi.instance.exports.memory.buffer.slice(
            ptr,
            ptr + COREAIOT_NUMBER_OF_SERVICE_UUIDS * 2
          )
          
          const serviceUuids = Array.from(new Uint16Array(buffer)).map(x => x.toString(16).padStart(4, '0'))
          wx.showModal({
            title: 'Service Uuids',
            content: serviceUuids.join(' '),
            showCancel: false
          })
          advertiseRequest = {
            serviceUuids,
          }
        } else {
          const advertise_mode = 0
          const tx_power_level = 0
          const channel = 0
          const ptr = this.data.wasi.instance.exports.coreaiot_generate_manufacturer_specific_data(
            id,
            alarm,
            battery,
            advertise_mode,
            tx_power_level,
            channel
          )
          const buffer = this.data.wasi.instance.exports.memory.buffer.slice(
            ptr,
            ptr + COREAIOT_MANUFACTURER_SPECIFIC_DATA_LENGTH
          )

          wx.showModal({
            title: 'Manufacturer Specific Data',
            content: Array.from(new Uint8Array(buffer)).map(x => x.toString(16).padStart(2, '0')).join(' '),
            showCancel: false
          })
          advertiseRequest = {
            manufacturerData: {
              manufacturerId: COREAIOT_MANUFACTURER_ID,
              manufacturerSpecificData: buffer
            }
          }
        }

        res.server.startAdvertising({
          advertiseRequest,
          success: () => {
            this.setData({
              busy: false,
              started: true
            })
            console.log('BLE started');
            this.data.ble = res.server;
          },
          fail: e => {
            console.error(e)
          }
        })
      },
      fail: e => {
        console.error(e);
      }
    });
  },
  stop() {
    this.data.ble.stopAdvertising({
      success: () => {
        this.setData({
          busy: false,
          started: false
        })
      },
      fail: e => {
        console.error(e)
      }
    })
  },
  async onLoad() {
    try {
      this.data.wasi = await WXWebAssembly.instantiate("sensor.wasm")
      this.data.systemInfo = wx.getSystemInfoSync()
      console.log(this.data.systemInfo)
      wx.openBluetoothAdapter({
        mode: 'peripheral',
        success: res => {
          console.log('BLE Adapter started', res)
          this.data.bleAdapter = res
          this.data.ready = true
        },
        fail: e => {
          console.error(e)
        }
      })

    } catch (e) {
      console.error(e)
    }
  },
  onUnload() {
    wx.closeBluetoothAdapter({
      success: () => {
        console.log('BLE Adapter closed')
        this.data.bleAdapter = null
      },
      fail: e => {
        console.error(e)
      },
    })
  }
})