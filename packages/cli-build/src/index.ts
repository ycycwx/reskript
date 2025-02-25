import {CommandConfig} from '@reskript/core';
import {BuildCommandLineArgs} from './interface';
import run from './run';

const command: CommandConfig<BuildCommandLineArgs> = {
    run,
    command: 'build',
    description: 'Build entire app using webpack',
    args: [
        ['--cwd [value]', 'override current working directory', process.cwd()],
        ['--mode [value]', 'set build mode, default to "production"', 'production'],
        ['--src [value]', 'specify the dir containing source files relative to cwd', 'src'],
        ['--build-target [value]', 'create index.html according to specific target'],
        ['--feature-only [value]', 'build named feature only, ignore other features'],
        ['--entries-only [entries...]', 'specify one or more entries to build, excludes other entries from build'],
        ['--analyze', 'enable bundle analytics', false],
        ['--profile', 'enable react profiling mode', false],
        ['--no-source-maps', 'disable generation of source maps', false],
        ['--clean', 'remove dist directory before build', false],
    ],
};

export default command;
