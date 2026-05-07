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
      width: options.width,
      height: options.height || 800,
      delay: options.delay,
      format: options.format,
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
      ? `${options.name}.${captureOpts.format}`
      : generateFilename(url, captureOpts.format);
    const outputPath = path.join(outputDir, filename);

    fs.writeFileSync(outputPath, result.buffer);
    spinner.succeed(chalk.green(`Saved: ${outputPath}`));

    printImageInfo(result.buffer, outputPath);

    if (options.copy) {
      await handleCopy(outputPath);
    }
  } catch (err) {
    spinner.fail(chalk.red(`Capture failed: ${err.message}`));
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

      const filename = options.name
        ? `${options.name}-${i}.${captureOpts.format}`
        : generateFilename(result.url, captureOpts.format, i);
      const outputPath = path.join(outputDir, filename);

      fs.writeFileSync(outputPath, result.buffer);
      console.log(chalk.green(`  Saved: ${outputPath}`));
      printImageInfo(result.buffer, outputPath);

      if (options.copy && i === 0) {
        await handleCopy(outputPath);
      }

      savedCount++;
    }

    console.log(chalk.bold(`\nTotal: ${savedCount} screenshots saved to ${outputDir}`));
  } catch (err) {
    spinner.fail(chalk.red(`Capture failed: ${err.message}`));
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

function generateFilename(url, format, index) {
  let domain = 'page';
  try {
    domain = new URL(url).hostname.replace(/\./g, '-');
  } catch {}
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const suffix = index !== undefined ? `-${index}` : '';
  return `pagesnap-${domain}${suffix}-${timestamp}.${format}`;
}

function printImageInfo(buffer, filepath) {
  const sizeKB = (buffer.length / 1024).toFixed(1);
  const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
  const sizeStr = buffer.length > 1024 * 1024 ? `${sizeMB} MB` : `${sizeKB} KB`;
  console.log(chalk.gray(`  Size: ${sizeStr}`));
}

program.parse();
