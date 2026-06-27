const { app, Tray, Menu } = require('electron');
const path = require('path');

function createTray(mainWindow) {
  // Use a blank or native icon if custom doesn't exist
  // To avoid errors we just try to load something generic or handle the exception
  let trayIconPath = path.join(__dirname, '../public/icon.png');
  let tray;
  try {
    tray = new Tray(trayIconPath);
  } catch (e) {
    // If icon.png is missing, fallback to process.execPath for windows or simply don't create tray
    console.log("Tray icon missing, skipping tray creation or using default");
    try {
        tray = new Tray(process.execPath); // Fallback to executable icon
    } catch(e2) {
        return null;
    }
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show App',
      click: () => {
        mainWindow.show();
      }
    },
    {
      label: 'Quit',
      click: () => {
        app.isQuiting = true;
        app.quit();
      }
    }
  ]);

  tray.setToolTip('Zynk');
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
    }
  });

  return tray;
}

module.exports = { createTray };
