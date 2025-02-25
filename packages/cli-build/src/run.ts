import * as path from 'path';
import rimraf from 'rimraf';
import chalk from 'chalk';
import {compact, difference, uniq} from 'lodash';
import webpack, {Configuration, Stats} from 'webpack';
import {readHostPackageConfig} from '@reskript/core';
import {
    createWebpackConfig,
    collectEntries,
    createRuntimeBuildEnv,
    checkProjectSettings,
    BuildContext,
} from '@reskript/config-webpack';
import {readProjectSettings, BuildEnv, ProjectSettings} from '@reskript/settings';
import * as partials from './partial';
import {BuildCommandLineArgs} from './interface';
import {drawFeatureMatrix, drawBuildReport, printWebpackResult, WebpackResult} from './report';
import inspect from './inspect';

const build = (configuration: Configuration | Configuration[]): Promise<Stats> => {
    const executor = (resolve: (value: Stats) => void) => webpack(
        configuration as Configuration, // https://github.com/Microsoft/TypeScript/issues/14107
        (err?: Error, stats?: Stats) => {
            if (err) {
                console.error(err);
                process.exit(22);
            }

            if (!stats) {
                console.error('Unknown error: webpack does not return its build stats');
                process.exit(22);
            }

            const toJsonOptions = {all: false, errors: true, warnings: true, assets: true};
            // webpack的`toJson`的定义是错的
            const {errors, warnings} = stats.toJson(toJsonOptions);
            for (const error of uniq(errors)) {
                printWebpackResult('error', error as unknown as WebpackResult);
            }
            for (const warning of uniq(warnings)) {
                printWebpackResult('warn', warning as unknown as WebpackResult);
            }

            if (stats.hasErrors()) {
                process.exit(22);
            }

            resolve(stats);
        }
    );

    return new Promise(executor);
};

const createConfigurations = (cmd: BuildCommandLineArgs, projectSettings: ProjectSettings): Configuration[] => {
    const featureNames = difference(Object.keys(projectSettings.featureMatrix), projectSettings.build.excludeFeatures);

    if (cmd.featureOnly && !featureNames.includes(cmd.featureOnly)) {
        console.error(chalk.red(`Feature ${cmd.featureOnly} is not configured in reskript.config.js`));
        process.exit(21);
    }

    checkProjectSettings(projectSettings);
    drawFeatureMatrix(projectSettings, cmd.featureOnly);

    const {name: hostPackageName} = readHostPackageConfig(cmd.cwd);
    const entries = collectEntries(cmd.cwd, cmd.src, cmd.entriesOnly);

    const featureNamesToUse = cmd.featureOnly ? [cmd.featureOnly] : featureNames;
    const toConfiguration = (featureName: string): Configuration => {
        const buildEnv: BuildEnv = {
            hostPackageName,
            projectSettings,
            usage: 'build',
            mode: cmd.mode,
            cwd: cmd.cwd,
            srcDirectory: cmd.src,
        };
        const runtimeBuildEnv = createRuntimeBuildEnv(buildEnv);
        const buildContext: BuildContext = {
            ...runtimeBuildEnv,
            entries,
            features: projectSettings.featureMatrix[featureName],
            buildTarget: featureName,
            isDefaultTarget: featureName === cmd.buildTarget || featureName === cmd.featureOnly,
        };
        const extras = [
            cmd.analyze && partials.analyze(buildContext),
            cmd.profile && partials.profile(),
            !cmd.sourceMaps && partials.noSourceMaps(),
        ];
        return createWebpackConfig(buildContext, compact(extras));
    };

    return featureNamesToUse.map(toConfiguration);
};

export default async (cmd: BuildCommandLineArgs): Promise<void> => {
    process.env.NODE_ENV = cmd.mode;

    if (cmd.clean) {
        rimraf.sync(path.join(cmd.cwd, 'dist'));
    }

    const projectSettings = readProjectSettings(cmd, 'build');
    const [initial, ...configurations] = createConfigurations(cmd, projectSettings);

    if (!initial) {
        const error = 'No build configuration created, you are possibly providing a feature matrix with dev only';
        console.error(chalk.red(error));
        process.exit(21);
    }

    // 由于webpack 5.x有很强的缓存能力，所以先构建一次做好缓存，后面几个再并行构建速度反而会变快
    const initialStats = await build([initial]);
    const stats = !!configurations.length && await build(configurations);
    drawBuildReport(stats ? [initialStats, stats] : [initialStats]);
    console.log('');
    inspect(initialStats, projectSettings.build.inspect);
};
