const EventEmitter = require('events')
const log = require('electron-log')

class DndManager extends EventEmitter {
  constructor (settings) {
    super()
    this.settings = settings
    this.monitorDnd = settings.get('monitorDnd')
    this.timer = null
    this.isOnDnd = false
    if (this.monitorDnd) {
      this.start()
    }
  }

  start () {
    this.monitorDnd = true
    this._checkDnd()
    log.info('Stretchly: starting Do Not Disturb monitoring')
  }

  stop () {
    this.monitorDnd = false
    this.isOnDnd = false
    clearTimeout(this.timer)
    this.timer = null
    log.info('Stretchly: stopping Do Not Disturb monitoring')
  }

  async _isDndEnabledLinux () {
    const dbus = require('dbus-next')
    const bus = dbus.sessionBus()
    try {
      const obj = await bus.getProxyObject('org.freedesktop.Notifications', '/org/freedesktop/Notifications')
      const properties = obj.getInterface('org.freedesktop.DBus.Properties')
      const dndEnabled = await properties.Get('org.freedesktop.Notifications', 'Inhibited')
      if (await dndEnabled.value) {
        return true
      }
    } catch (e) {
      // KDE is not running
    }

    try {
      const obj = await bus.getProxyObject('org.xfce.Xfconf', '/org/xfce/Xfconf')
      const properties = obj.getInterface('org.xfce.Xfconf')
      const dndEnabled = await properties.GetProperty('xfce4-notifyd', '/do-not-disturb')
      if (await dndEnabled.value) {
        return true
      }
    } catch (e) {
      // XFCE is not running
    }

    return false
  }

  async _doNotDisturb () {
    // TODO also check for session state? https://github.com/felixrieseberg/electron-notification-state/tree/master#session-state
    if (this.monitorDnd) {
      if (process.platform === 'win32') {
        let wfa = 0
        try {
          wfa = require('windows-focus-assist').getFocusAssist().value
        } catch (e) { wfa = -1 } // getFocusAssist() throw an error if OS isn't windows
        const wqh = require('windows-quiet-hours').getIsQuietHours()
        return wqh || (wfa !== -1 && wfa !== 0)
      } else if (process.platform === 'darwin') {
        return require('macos-notification-state').getDoNotDisturb()
      } else if (process.platform === 'linux') {
        return await this._isDndEnabledLinux()
      }
    } else {
      return false
    }
  }

  _checkDnd () {
    this.timer = setInterval(async () => {
      const doNotDisturb = await this._doNotDisturb()
      if (!this.isOnDnd && doNotDisturb) {
        this.isOnDnd = true
        this.emit('dndStarted')
      }
      if (this.isOnDnd && !doNotDisturb) {
        this.isOnDnd = false
        this.emit('dndFinished')
      }
    }, 1000)
  }
}

module.exports = DndManager
