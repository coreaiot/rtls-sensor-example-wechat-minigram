// index.js
// 获取应用实例
const app = getApp()
const COREAIOT_MANUFACTURER_ID = "0x000d"
const COREAIOT_MANUFACTURER_SPECIFIC_DATA_LENGTH = 27
const COREAIOT_NUMBER_OF_SERVICE_UUIDS = 13

Page({
  data: {
    busy: false,
    started: false,
    wasi: null,
    ready: false,
    systemInfo: null,
    mac: '1234',
    battery: 50,
    delta: 0.1,
    alarm: true,
    moving: false,
    content: '',
    powerLevels: ['low', 'medium', 'high'],
    powerLevelIdx: 0,
    broadcastItv: 500,
    broadcastSleepItv: 500
  },
  macChange(e) {
    this.data.mac = e.detail.value
  },
  alarmChange(e) {
    this.data.alarm = ~~e.detail.value
  },
  batteryChange(e) {
    this.data.battery = ~~e.detail.value
  },
  deltaChange(e) {
    this.data.delta = Number(e.detail.value)
  },
  // 事件处理函数
  onClick() {
    this.setData({
      busy: true
    })
    if (this.data.started) {
      this.stop()
    } else {
      this.start()
    }
  },
  makeAdvertiseRequest() {
    if (this.data.systemInfo.platform === 'ios') {
      const ptr = this.data.wasi.instance.exports.coreaiot_generate_service_uuids(
        parseInt(this.data.mac, 16),
        ~~this.data.alarm,
        Math.floor(this.data.battery / 10),
        ~~!this.data.moving,
      )
      const buffer = this.data.wasi.instance.exports.memory.buffer.slice(
        ptr,
        ptr + COREAIOT_NUMBER_OF_SERVICE_UUIDS * 2
      )

      const serviceUuids = Array.from(new Uint16Array(buffer)).map(x => x.toString(16).padStart(4, '0'))
      this.advertiseRequest = {
        serviceUuids,
        connectable: false
      }
      const content = serviceUuids.join(' ')
      this.setData({
        content
      })
    } else {
      const advertise_mode = 0
      const tx_power_level = 0
      const channel = 0
      const ptr = this.data.wasi.instance.exports.coreaiot_generate_manufacturer_specific_data(
        parseInt(this.data.mac, 16),
        ~~this.data.alarm,
        Math.floor(this.data.battery / 10),
        advertise_mode,
        tx_power_level,
        channel,
        ~~!this.data.moving,
      )
      let buffer = this.data.wasi.instance.exports.memory.buffer.slice(
        ptr,
        ptr + COREAIOT_MANUFACTURER_SPECIFIC_DATA_LENGTH
      )

      this.advertiseRequest = {
        connectable: false,
        deviceName: '',
        manufacturerData: [{
          manufacturerId: COREAIOT_MANUFACTURER_ID,
          manufacturerSpecificData: buffer
        }]
      }
      const content = Array.from(new Uint8Array(buffer)).map(x => x.toString(16).padStart(2, '0')).join(' ')
      this.setData({
        content
      })
    }
  },

  async initBleServer() {
    if (this.ble) return
    try {
      const res = await wx.createBLEPeripheralServer()
      this.ble = res.server
    } catch (e) {
      console.error(e);
    }
  },
  async start() {
    await this.initBleServer()
    this.makeAdvertiseRequest()
    this.stopped = false
    while (!this.stopped) {
      const startTs = new Date().getTime()
      const started = await new Promise(r => {
        this.ble.startAdvertising({
          powerLevel: this.data.powerLevels[this.data.powerLevelIdx],
          advertiseRequest: this.advertiseRequest,
          success: () => {
            this.setData({
              busy: false,
              started: true
            })
            console.log('BLE started')
            r(true)
          },
          fail: e => {
            console.error(e)
            r(false)
          }
        })
      })
      const startedTs = new Date().getTime()
      let elapsed = startedTs - startTs
      await new Promise(r => setTimeout(r, this.data.broadcastItv - elapsed))
      if (!started) continue
      let stopped = false
      while (!stopped) {
        stopped = await new Promise(r => {
          this.ble.stopAdvertising({
            success: () => {
              console.log('BLE stopped')
              r(true)
            },
            fail: e => {
              console.error(e)
              r(false)
            }
          })
        })
      }
      elapsed = new Date().getTime() - startedTs
      await new Promise(r => setTimeout(r, this.data.broadcastSleepItv - elapsed))
    }
    this.setData({
      busy: false,
      started: false
    })
  },
  async stop() {
    this.stopped = true
  },
  async update() {
    if (!this.data.started) return
    await this.stop()
    this.start()
  },
  async onLoad() {
    try {
      this.data.wasi = await WXWebAssembly.instantiate("sensor.wasm")
      this.data.systemInfo = wx.getSystemInfoSync()
      console.log(this.data.systemInfo)
      await wx.openBluetoothAdapter({
        mode: 'peripheral'
      })
      this.setData({
        ready: true,
      })
      wx.startAccelerometer({
        interval: 'normal'
      })
      wx.onAccelerometerChange(e => {
        const g = Math.sqrt(e.x ** 2 + e.y ** 2 + e.z ** 2)
        const moving = g < 1 - this.data.delta || g > 1 + this.data.delta
        if (this.data.moving != moving) {
          if (!moving) {
            ++this.movingBuffer
            if (this.movingBuffer >= 5) {
              this.setData({
                moving
              })
              this.update()
            }
          } else {
            this.movingBuffer = 0
            this.setData({
              moving
            })
            this.update()
          }
        }
      })
    } catch (e) {
      console.error(e)
    }
  },
  async onUnload() {
    await wx.closeBluetoothAdapter({})
    console.log('BLE Adapter closed')
  },

  bindPickerChange(e) {
    this.setData({
      powerLevelIdx: e.detail.value
    })
  },

  broadcastItvChange(e) {
    this.data.broadcastItv = Number(e.detail.value)
  },

  broadcastSleepItvChange(e) {
    this.data.broadcastSleepItv = Number(e.detail.value)
  },

  numberOfBroadcastersChange(e) {
    this.data.numberOfBroadcasters = Number(e.detail.value)
  },
})