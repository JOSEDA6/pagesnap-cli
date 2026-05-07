const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

function copyImageToClipboard(imagePath) {
  const platform = os.platform();

  if (platform === 'win32') {
    const absPath = path.resolve(imagePath);
    const psScript = `
      Add-Type -AssemblyName System.Windows.Forms
      $img = [System.Drawing.Image]::FromFile('${absPath.replace(/'/g, "''")}')
      [System.Windows.Forms.Clipboard]::SetImage($img)
      $img.Dispose()
    `;
    execSync(`powershell -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`, {
      stdio: 'pipe',
    });
    return true;
  }

  if (platform === 'darwin') {
    const absPath = path.resolve(imagePath);
    execSync(`osascript -e 'set the clipboard to (read (POSIX file "${absPath}") as «class PNGf»)'`, {
      stdio: 'pipe',
    });
    return true;
  }

  if (platform === 'linux') {
    const absPath = path.resolve(imagePath);
    try {
      execSync(`xclip -selection clipboard -t image/png -i "${absPath}"`, { stdio: 'pipe' });
      return true;
    } catch {
      try {
        execSync(`xsel --clipboard --input < "${absPath}"`, { stdio: 'pipe' });
        return true;
      } catch {
        return false;
      }
    }
  }

  return false;
}

module.exports = { copyImageToClipboard };
