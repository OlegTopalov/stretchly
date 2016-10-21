// process.on('uncaughtException', (...args) => console.error(...args))
const {app, BrowserWindow, Tray, Menu, ipcMain, shell, dialog} = require('electron')
const path = require('path')
const AppSettings = require('./utils/settings')
const defaultSettings = require('./utils/defaultSettings')
let microbreakIdeas = require('./microbreakIdeas')
let breakIdeas = require('./breakIdeas')
let BreaksPlanner = require('./breaksPlanner')

let breakPlanner
let appIcon = null
let processWin = null
let microbreakWin = null
let breakWin = null
let aboutWin = null
let settingsWin = null
let finishMicrobreakTimer
let finishBreakTimer
let resumeBreaksTimer
let settings
let isPaused = false

global.shared = {
  isNewVersion: false
}

app.on('ready', startProcessWin)
app.on('ready', loadSettings)
app.on('ready', showStartUpWindow)
app.on('ready', planBreak)
app.on('ready', createTrayIcon)

app.on('window-all-closed', () => {
  // do nothing, so app wont get closed
})

let shouldQuit = app.makeSingleInstance(function (commandLine, workingDirectory) {
  if (appIcon) {
    // Someone tried to run a second instance
  }
})

if (shouldQuit) {
  console.log('stretchly is already running.')
  app.quit()
}

function createTrayIcon () {
  if (process.platform === 'darwin') {
    app.dock.hide()
  }
  const iconPath = path.join(__dirname, 'images/stretchly_18x18.png')
  appIcon = new Tray(iconPath)
  appIcon.setToolTip('stretchly - break time reminder app')
  isPaused = false
  appIcon.setContextMenu(getTrayMenu())
}

function startProcessWin () {
  const modalPath = path.join('file://', __dirname, 'process.html')
  processWin = new BrowserWindow({
    show: false
  })
  processWin.loadURL(modalPath)
  processWin.webContents.on('did-finish-load', () => {
    planVersionCheck()
  })
}

function planVersionCheck (seconds = 1) {
  setTimeout(checkVersion, seconds * 1000)
}

function checkVersion () {
  processWin.webContents.send('checkVersion', `v${app.getVersion()}`)
  planVersionCheck(3600 * 5)
}

function showStartUpWindow () {
  const modalPath = path.join('file://', __dirname, 'start.html')
  let appStartupWin = new BrowserWindow({
    frame: false,
    alwaysOnTop: true,
    title: 'stretchly',
    backgroundColor: settings.get('mainColor'),
    width: 600,
    height: 170
  })
  appStartupWin.loadURL(modalPath)
  setTimeout(function () {
    appStartupWin.close()
    appStartupWin = null
  }, 5000)
}

function startMicrobreak () {
  // don't start another break if break running
  if (microbreakWin) {
    console.log('microbreak already running')
    return
  }

  const modalPath = path.join('file://', __dirname, 'microbreak.html')
  microbreakWin = new BrowserWindow({
    frame: false,
    alwaysOnTop: true,
    backgroundColor: settings.get('mainColor'),
    title: 'stretchly'
  })
  microbreakWin.loadURL(modalPath)
  // microbreakWin.webContents.openDevTools()
  microbreakWin.webContents.on('did-finish-load', () => {
    microbreakWin.webContents.send('microbreakIdea', microbreakIdeas.randomElement)
  })
  finishMicrobreakTimer = setTimeout(finishMicrobreak, settings.get('microbreakDuration'))
}

function startBreak () {
  // don't start another break if break running
  if (breakWin) {
    console.log('break already running')
    return
  }
  const modalPath = path.join('file://', __dirname, 'break.html')
  breakWin = new BrowserWindow({
    frame: false,
    alwaysOnTop: true,
    backgroundColor: settings.get('mainColor'),
    title: 'stretchly'
  })
  breakWin.loadURL(modalPath)
  // breakWin.webContents.openDevTools()
  breakWin.webContents.on('did-finish-load', () => {
    breakWin.webContents.send('breakIdea', breakIdeas.randomElement)
  })
  finishBreakTimer = setTimeout(finishBreak, settings.get('breakDuration'))
}

function finishMicrobreak (shouldPlaySound = true) {
  if (shouldPlaySound) {
    processWin.webContents.send('playSound', settings.get('audio'))
  }
  microbreakWin.close()
  microbreakWin = null
  breakPlanner.nextBreak.plan()
}

function finishBreak (shouldPlaySound = true) {
  if (shouldPlaySound) {
    processWin.webContents.send('playSound', settings.get('audio'))
  }
  breakWin.close()
  breakWin = null
  breakPlanner.nextBreak.plan()
}

function planBreak () {
  let nb = breakPlanner.nextBreak
  if (nb) {
    nb.plan()
  }
}

function loadSettings () {
  const dir = app.getPath('userData')
  const settingsFile = `${dir}/config.json`
  settings = new AppSettings(settingsFile)
  breakPlanner = new BreaksPlanner(settings, startMicrobreak, startBreak)
}

function pauseBreaks (seconds) {
  if (microbreakWin) {
    clearTimeout(finishMicrobreakTimer)
    finishMicrobreak()
  }
  if (breakWin) {
    clearTimeout(finishBreakTimer)
    finishBreak()
  }
  breakPlanner.pause()
  if (seconds !== 1) {
    resumeBreaksTimer = setTimeout(resumeBreaks, seconds)
  }
  isPaused = true
  appIcon.setContextMenu(getTrayMenu())
}

function resumeBreaks () {
  clearTimeout(resumeBreaksTimer)
  isPaused = false
  let nb = breakPlanner.resume()
  if (nb) {
    nb.plan()
    appIcon.setContextMenu(getTrayMenu())
    processWin.webContents.send('showNotification', 'Resuming breaks')
  }
}

function showAboutWindow () {
  const modalPath = path.join('file://', __dirname, 'about.html')
  aboutWin = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: settings.get('mainColor'),
    title: `About stretchly v${app.getVersion()}`
  })
  aboutWin.loadURL(modalPath)
}

function showSettingsWindow () {
  const modalPath = path.join('file://', __dirname, 'settings.html')
  settingsWin = new BrowserWindow({
    alwaysOnTop: true,
    backgroundColor: settings.get('mainColor'),
    title: 'Settings'
  })
  settingsWin.loadURL(modalPath)
  // settingsWin.webContents.openDevTools()
  processWin.webContents.send('showNotification', 'Settings are applied once changed. I hope that\'s fine with you!')
  settingsWin.webContents.on('did-finish-load', () => {
    settingsWin.webContents.send('renderSettings', settings.data)
  })
}

function saveDefaultsFor (array, next) {
  for (let index in array) {
    settings.set(array[index], defaultSettings[array[index]])
  }
}

function getTrayMenu () {
  let trayMenu = []
  if (global.shared.isNewVersion) {
    trayMenu.push({
      label: 'Download latest version',
      click: function () {
        shell.openExternal('https://github.com/hovancik/stretchly/releases')
      }
    })
  }

  trayMenu.push({
    label: 'About',
    click: function () {
      showAboutWindow()
    }
  }, {
    type: 'separator'
  })

  if (!isPaused) {
    let submenu = []
    if (settings.get('microbreak')) {
      submenu = submenu.concat([{
        label: 'microbreak',
        click: function () {
          breakPlanner.skipToMicrobreak().plan()
        }
      }])
    }
    if (settings.get('break')) {
      submenu = submenu.concat([{
        label: 'break',
        click: function () {
          breakPlanner.skipToBreak().plan()
        }
      }])
    }
    if (settings.get('break') || settings.get('microbreak')) {
      trayMenu.push({
        label: 'Skip to the next',
        submenu: submenu
      })
    }
  }

  if (isPaused) {
    trayMenu.push({
      label: 'Resume',
      click: function () {
        resumeBreaks()
      }
    })
  } else {
    trayMenu.push({
      label: 'Pause',
      submenu: [
        {
          label: 'for an hour',
          click: function () {
            pauseBreaks(3600 * 1000)
          }
        }, {
          label: 'for 2 hours',
          click: function () {
            pauseBreaks(3600 * 2 * 1000)
          }
        }, {
          label: 'for 5 hours',
          click: function () {
            pauseBreaks(3600 * 5 * 1000)
          }
        }, {
          label: 'indefinitely',
          click: function () {
            pauseBreaks(1)
          }
        }
      ]
    }, {
      label: 'Reset breaks',
      click: function () {
        breakPlanner.reset()
      }
    })
  }

  trayMenu.push({
    label: 'Settings',
    click: function () {
      showSettingsWindow()
    }
  })

  if (process.platform === 'darwin' || process.platform === 'win32') {
    let loginItemSettings = app.getLoginItemSettings()
    let openAtLogin = loginItemSettings.openAtLogin
    trayMenu.push({
      label: 'Start at login',
      type: 'checkbox',
      checked: openAtLogin,
      click: function () {
        app.setLoginItemSettings({openAtLogin: !openAtLogin})
      }
    })
  }

  trayMenu.push({
    type: 'separator'
  }, {
    label: 'Quit',
    click: function () {
      app.quit()
    }
  })

  return Menu.buildFromTemplate(trayMenu)
}

ipcMain.on('finish-microbreak', function (event, shouldPlaySound) {
  clearTimeout(finishMicrobreakTimer)
  finishMicrobreak(shouldPlaySound)
})

ipcMain.on('finish-break', function (event, shouldPlaySound) {
  clearTimeout(finishBreakTimer)
  finishBreak(shouldPlaySound)
})

ipcMain.on('save-setting', function (event, key, value) {
  settings.set(key, value)
  settingsWin.webContents.send('renderSettings', settings.data)
  appIcon.setContextMenu(getTrayMenu())
})

ipcMain.on('update-tray', function (event) {
  appIcon.setContextMenu(getTrayMenu())
})

ipcMain.on('set-default-settings', function (event, data) {
  const options = {
    type: 'info',
    title: 'Reset to defaults',
    message: 'Are you sure you wanna reset setings on this window to defaults?',
    buttons: ['Yes', 'No']
  }
  dialog.showMessageBox(options, function (index) {
    if (index === 0) {
      saveDefaultsFor(data)
      settingsWin.webContents.send('renderSettings', settings.data)
    }
  })
})
