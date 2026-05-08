#!/usr/bin/env node

const { Command } = require('commander');
const chalk = require('chalk');
const ora = require('ora');
const path = require('path');
const fs = require('fs');
const { capture, captureLinks } = require('./capture');
const { copyImageToClipboard } = require('./clipboard');
const pkg = require('../package.json');

const program = new Command();

program
  .name('pagesnap')
  .description('Full-page web screenshots for AI conversations')
  .version(pkg.version);

program
  .argument('<url>', 'URL of the page to capture')
  .option('-o, --output <dir>', 'Output directory', '.')
  .option('-n, --name <filename>', 'Output filename (without extension)')
  .option('-l, --links', 'Detect nav links and capture each linked page')
  .option('-c, --copy', 'Copy screenshot to clipboard')
  .option('-w, --width <pixels>', 'Viewport width', parseInt, 1280)
  .option('--height <pixels>', 'Viewport height', parseInt, 800)
  .option('-d, --delay <ms>', 'Scroll delay in ms', parseInt, 300)
  .option('-f, --format <type>', 'Image format: png or jpeg', 'png')
  .option('-q, --quality <number>', 'JPEG quality (1-100)', parseInt, 90)
  .option('-t, --timeout <ms>', 'Page load timeout in ms', parseInt, 30000)
  .option('-r, --retries <number>', 'Number of retries for transient failures', parseInt, 2)
  .option('--user-agent <string>', 'Custom user agent string')
  .option('--mobile', 'Use mobile user agent and viewport')
  .option('--no-sticky', 'Keep sticky/fixed elements visible')
  .action(async (url, options) => {
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }

    const outputDir = path.resolve(options.output);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const captureOpts = {
      width: parseInt(options.width) || 1280,
      height: parseInt(options.height) || 800,
      delay: parseInt(options.delay) || 300,
      format: options.format || 'png',
      quality: options.quality !== undefined ? parseInt(options.quality) : 90,
      timeout: parseInt(options.timeout) || 30000,
      retries: parseInt(options.retries) !== undefined ? parseInt(options.retries) : 2,
      userAgent: options.userAgent,
      mobile: options.mobile || false,
      hideStickyElements: options.sticky !== false,
    };

    if (options.links) {
      await handleMultiCapture(url, outputDir, options, captureOpts);
    } else {
      await handleSingleCapture(url, outputDir, options, captureOpts);
    }
  });

async function handleSingleCapture(url, outputDir, options, captureOpts) {
  const spinner = ora('Capturing full page...').start();

  try {
    const result = await capture(url, captureOpts);

    const filename = options.name
      ? `${sanitizeFilename(options.name)}.${captureOpts.format}`
      : generateFilename(url, captureOpts.format);
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, result.buffer);
    spinner.succeed(chalk.green(`Saved: ${outputPath}`));

    printImageInfo(result.buffer);

    if (options.copy) {
      await handleCopy(outputPath);
    }
  } catch (err) {
    spinner.fail(chalk.red('Capture failed'));
    printError(err);
    process.exit(1);
  }
}

async function handleMultiCapture(url, outputDir, options, captureOpts) {
  const spinner = ora('Detecting navigation links...').start();

  try {
    captureOpts.onProgress = ({ page, total, text }) => {
      spinner.text = `Capturing page ${page + 1}/${total}: ${text}`;
    };

    const { links, results } = await captureLinks(url, captureOpts);

    if (links.length === 0) {
      spinner.info('No navigation links found, captured current page only');
    } else {
      spinner.succeed(chalk.green(`Found ${links.length} navigation links`));
    }

    let savedCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (result.error) {
        console.log(chalk.yellow(`  Skip: ${result.linkText || result.url} - ${result.error}`));
        continue;
      }

      const label = i === 0 ? 'main' : String(i);
      const filename = options.name
        ? `${sanitizeFilename(options.name)}-${label}.${captureOpts.format}`
        : generateFilename(result.url, captureOpts.format, label);
      const outputPath = path.join(outputDir, filename);

      fs.writeFileSync(outputPath, result.buffer);
      console.log(chalk.green(`  Saved: ${outputPath}`));
      printImageInfo(result.buffer);

      if (options.copy && i === 0) {
        await handleCopy(outputPath);
      }

      savedCount++;
    }

    console.log(chalk.bold(`\nTotal: ${savedCount} screenshots saved to ${outputDir}`));
  } catch (err) {
    spinner.fail(chalk.red('Capture failed'));
    printError(err);
    process.exit(1);
  }
}

async function handleCopy(imagePath) {
  try {
    const success = copyImageToClipboard(imagePath);
    if (success) {
      console.log(chalk.cyan('  Copied to clipboard'));
    } else {
      console.log(chalk.yellow('  Clipboard copy not supported on this platform'));
    }
  } catch (err) {
    console.log(chalk.yellow(`  Clipboard copy failed: ${err.message}`));
  }
}

function generateFilename(url, format, label) {
  let domain = 'page';
  try {
    domain = new URL(url).hostname.replace(/\./g, '-');
  } catch {}
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const suffix = label !== undefined ? `-${label}` : '';
  return `pagesnap-${domain}${suffix}-${timestamp}.${format}`;
}

function sanitizeFilename(name) {
  return name.replace(/[<>:"|?*]/g, '_').replace(/\s+/g, '-');
}

function getErrorMessage(err) {
  const msg = err.message || String(err);

  if (msg.includes('ERR_CONNECTION_') || msg.includes('ENOTFOUND')) {
    return {
      title: 'Connection failed',
      details: [
        'Check your internet connection',
        'Verify the URL is correct',
        'Try increasing timeout with -t 60000'
      ]
    };
  }

  if (msg.includes('Navigation timeout') || msg.includes('ERR_TIMEOUT')) {
    return {
      title: 'Page load timeout',
      details: [
        'Page took too long to load',
        'Try increasing timeout: -t 60000',
        'Page may have heavy content or slow network'
      ]
    };
  }

  if (msg.includes('chromium') || msg.includes('Chrome') || msg.includes('browser')) {
    return {
      title: 'Browser error',
      details: [
        'Make sure Chrome or Chromium is installed',
        'Download from: https://www.google.com/chrome',
        'Or install Chromium: https://www.chromium.org'
      ]
    };
  }

  if (msg.includes('permission') || msg.includes('EACCES')) {
    return {
      title: 'Permission denied',
      details: [
        'Check write permissions for output directory',
        'Try a different output folder: -o ./screenshots'
      ]
    };
  }

  if (msg.includes('Protocol error') || msg.includes('Target closed') || msg.includes('Page crashed')) {
    return {
      title: 'Browser crash',
      details: [
        'Page may be too complex or memory-intensive',
        'Try reducing viewport size: -w 1280 --height 800',
        'Retry with: -r 3'
      ]
    };
  }

  return { title: 'Capture failed', details: [msg] };
}

function printError(err) {
  const { title, details } = getErrorMessage(err);
  console.log(chalk.red.bold(`\n  ${title}`));
  details.forEach(d => console.log(chalk.yellow(`    → ${d}`)));
  console.log(chalk.gray('\n  Run `pagesnap --help` for more options\n'));
}

function printImageInfo(buffer) {
  const sizeKB = (buffer.length / 1024).toFixed(1);
  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
  const sizeStr = buffer.length > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
  console.log(chalk.gray(`  Size: ${sizeStr}`));
}

program.parse();
