const path = require('path');
const chalk = require('chalk');
const child_process = require('child_process');
const inquirer = require('inquirer');
const fs = require('fs');
const copy = require('recursive-copy');
const utils = require('../utils');
const server = require('../run/server');
const _ = require('underscore');
const logger = require('weexpack-common').CordovaLogger.get();
const { PlatformConfig, iOSConfigResolver, Platforms } = require('../utils/config');

/**
 * compile jsbundle.
 */
const copyJsbundleAssets = () => {
  logger.info(`\n=> ${chalk.blue.bold('Move JSbundle to dist')} \n`);
  const options = {
    filter: [
      '*.js',
      '!*.web.js'
    ],
    overwrite: true
  };
  return copy(path.resolve('dist'), path.resolve('platforms/ios/bundlejs/'), options)
  .on(copy.events.COPY_FILE_START, function(copyOperation) {
    logger.info('Copying file ' + copyOperation.src + '...');
  })
  .on(copy.events.COPY_FILE_COMPLETE, function(copyOperation) {
    logger.info('Copied to ' + copyOperation.dest);
  })
  .on(copy.events.ERROR, function(error, copyOperation) {
    logger.error('Unable to copy ' + copyOperation.dest);
  })
  .then(result => {
    logger.info(`Move ${result.length} files.`);
  })
}

/**
 * pass options.
 * @param {Object} options
 */
const passOptions = (options) => {
  return new Promise((resolve, reject) => {
    resolve({
      options
    })
  })
}

/**
 * Prepare
 * @param {Object} options
 */
const prepareIOS = ({ options }) => {
  return new Promise((resolve, reject) => {
    const rootPath = process.cwd();
    if (!utils.checkIOS(rootPath)) {
      logger.info(chalk.red('  iOS project not found !'));
      logger.info(`  You should run ${chalk.blue('weex create')} or ${chalk.blue('weex platform add ios')} first`);
      reject();
    }
    // change working directory to ios
    process.chdir(path.join(rootPath, 'platforms/ios'));

    const xcodeProject = utils.findXcodeProject(process.cwd());

    if (xcodeProject) {
      logger.info(`\n=> ${chalk.blue.bold('start iOS app')}\n`);
      resolve({ xcodeProject, options, rootPath });
    }
    else {
      logger.info(`\n${chalk.red.bold('Could not find Xcode project files in ios folder')}`);
      logger.info(`\nPlease make sure you have installed iOS Develop Environment and CocoaPods`);
      logger.info(`\nSee ${chalk.cyan('http://alibaba.github.io/weex/doc/advanced/integrate-to-ios.html')}`);
      reject();
    }
  });
}

/**
 * Install dependency
 * @param {Object} xcode project
 * @param {Object} options
 */
const installDep = ({ xcodeProject, options, rootPath, configs }) => {
  logger.info(`\n=> ${chalk.blue.bold('pod update')}\n`);
  return utils.exec('pod update').then(() => ({ xcodeProject, options, rootPath , configs}));
}

/**
 * @desc resolve config in the android project
 * @param {Object} options
 * @param {String} rootPath
 */
const resolveConfig = ({
  xcodeProject, 
  options, 
  rootPath
}) => {
  const iosConfig = new PlatformConfig(iOSConfigResolver, rootPath, Platforms.ios, {Ws:""});
  return iosConfig.getConfig().then((configs) => {
    iOSConfigResolver.resolve(configs);
    return {
      xcodeProject,
      options,
      rootPath,
      configs
    };
  });
}

/**
 * build the iOS app on simulator or real device
 * @param {Object} device
 * @param {Object} xcode project
 * @param {Object} options
 */
const buildApp = ({xcodeProject, options, rootPath, configs }) => {
  return new Promise((resolve, reject) => {
    let projectInfo = '';
    try {
      projectInfo = utils.getIOSProjectInfo();
    }
    catch (e) {
      reject(e);
    }

    const scheme = projectInfo.project.schemes[0];

    let buildInfo = '';
    logger.info(`\n=> ${chalk.blue.bold('Buiding project...')}\n`);
    try {
      if (_.isEmpty(configs)) {
        reject(new Error('iOS config dir not detected.'));
      }
      buildInfo = child_process.execSync(`xcodebuild -${xcodeProject.isWorkspace ? 'workspace' : 'project'} ${xcodeProject.name} -scheme ${scheme} -configuration PROD -sdk iphoneos -derivedDataPath build clean build`, { encoding: 'utf8' });
    }
    catch (e) {
      reject(e);
    }
    resolve({ device, xcodeProject, options, configs });
    
  });
}


/**
 * Choose one device to run
 * @param {Array} devicesList: name, version, id, isSimulator
 * @param {Object} xcode project
 * @param {Object} options
 * @return {Object} device
 */
function chooseDevice ({ devicesList, xcodeProject, options }) {
  return new Promise((resolve, reject) => {
    if (devicesList && devicesList.length > 0) {
      const listNames = [new inquirer.Separator(' = devices = ')];
      for (const device of devicesList) {
        listNames.push(
          {
            name: `${device.name} ios: ${device.version}`,
            value: device
          }
        );
      }

      inquirer.prompt([
        {
          type: 'list',
          message: 'Choose one of the following devices',
          name: 'chooseDevice',
          choices: listNames
        }
      ])
        .then((answers) => {
          const device = answers.chooseDevice;
          resolve({ device, xcodeProject, options });
        });
    }
    else {
      reject('No ios devices found.');
    }
  });
}


/**
 * move assets.
 */
const copyReleaseAssets = ({
  options,
  rootPath,
  configs
}) => {
  logger.info(`\n=> ${chalk.blue.bold('Move Release File to `release/ios`')} \n`);
  const copyOptions = {
    filter: [
      '*.apk'
    ],
    overwrite: true
  };
  return copy(path.resolve('build/Build/Products/Release-iphoneos'), path.resolve(path.join('../../release/ios', configs.BuildVersion)), copyOptions)
  .on(copy.events.COPY_FILE_START, function(copyOperation) {
    logger.info('Copying file ' + copyOperation.src + '...');
  })
  .on(copy.events.COPY_FILE_COMPLETE, function(copyOperation) {
    logger.info('Copied to ' + copyOperation.dest);
  })
  .on(copy.events.ERROR, function(error, copyOperation) {
    logger.error('Unable to copy ' + copyOperation.dest);
  })
  .then(result => {
    logger.info(`Move ${result.length} files. SUCCESSFUL`);
  })
}

/**
 * Build iOS app
 * @param {Object} options
 */
const buildIOS = (options) => {
  utils.checkAndInstallForIosDeploy()
    .then(utils.buildJS)
    .then(copyJsbundleAssets)
    .then(() => passOptions(options))
    .then(prepareIOS)
    .then(installDep)
    .then(resolveConfig)
    .then(buildApp)
    .catch((err) => {
      if (err) {
        logger.error(err);
        const errTips = 'You should config `CodeSign` and `Profile` in the `ios.config.json`\n\n    We suggest that you open the `platform/ios` directory.\n\n    Package your project as a normal ios project!'
        logger.info(`\n=>  ${chalk.blue.bold(errTips)}`)
      }
    });
}

module.exports = buildIOS;
