const { execFileSync } = require('child_process');
const path = require('path');
const os = require('os');

function copyImageToClipboard(imagePath) {
  const platform = os.platform();
  const absPath = path.resolve(imagePath);

  if (platform === 'win32') {
    const psScript = [
      'Add-Type -AssemblyName System.Windows.Forms;',
      `$img = [System.Drawing.Image]::FromFile('${absPath.replace(/'/g, "''")}');`,
      '[System.Windows.Forms.Clipboard]::SetImage($img);',
      '$img.Dispose()'
    ].join(' ');
    execFileSync('powershell', ['-NoProfile', '-Command', psScript], { stdio: 'pipe' });
    return true;
  }

  if (platform === 'darwin') {
    execFileSync('osascript', [
      '-e', `set the clipboard to (read (POSIX file "${absPath}") as <<class PNGf>>)`
    ], { stdio: 'pipe' });
    return true;
  }

  if (platform === 'linux') {
    try {
      execFileSync('xclip', ['-selection', 'clipboard', '-t', 'image/png', '-i', absPath], { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  return false;
}

module.exports = { copyImageToClipboard };
