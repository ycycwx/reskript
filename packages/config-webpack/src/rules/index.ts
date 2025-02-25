import * as path from 'path';
import {compact} from 'lodash';
import {RuleSetRule, RuleSetUseItem} from 'webpack';
import {BuildEntry} from '@reskript/settings';
import * as loaders from '../loaders';

type LoaderType = keyof typeof loaders;

const createUseWith = (entry: BuildEntry) => {
    const createLoader = (name: LoaderType): RuleSetUseItem | null => {
        const factory = loaders[name];
        return factory(entry);
    };

    return (...names: Array<LoaderType | false>): RuleSetUseItem[] => compact(compact(names).map(createLoader));
};

const projectSource = (cwd: string) => {
    const projectDirectory = cwd.endsWith(path.sep) ? cwd : cwd + path.sep;

    return (resource: string) => (
        resource.includes(projectDirectory)
            && !resource.includes(projectDirectory + 'externals')
            && !resource.includes(`${path.sep}node_modules${path.sep}`)
    );
};

const normalizeRuleMatch = (cwd: string, configured: boolean | ((resource: string) => boolean)) => {
    switch (configured) {
        case true:
            return projectSource(cwd);
        case false:
            return () => false;
        default:
            return configured;
    }
};

// 在第三方代码与项目代码的处理上，使用的策略是“非`cwd`下的全部算第三方代码”，而不是“包含`node_modules`的算第三方”。
//
// 这一逻辑取决于在使用monorepo时的形式，当前monorepo下我们要求被引用的包是构建后的。

export const script = (entry: BuildEntry): RuleSetRule => {
    const {cwd, projectSettings: {build: {script: {babel}}}} = entry;
    const use = createUseWith(entry);
    const isProjectSource = projectSource(cwd);
    const isWorker = (resource: string) => isProjectSource(resource) && /\.worker\.[jt]sx?$/.test(resource);
    const rulesWithBabelRequirement = (requireBabel: boolean) => {
        return {
            oneOf: [
                // 在项目源码内的`.worker.js`，需要`worker-loader`
                {
                    resource: isWorker,
                    use: use('worker', requireBabel && 'babel'),
                },
                // 项目源码内的其它文件，需要`eslint`检查
                {
                    resource: isProjectSource,
                    use: use(requireBabel && 'babel'),
                },
                // 第三方代码，按需过`babel`
                {
                    use: use(requireBabel && 'babel'),
                },
            ],
        };
    };

    return {
        test: /\.[jt]sx?$/,
        oneOf: [
            {
                resource: normalizeRuleMatch(cwd, babel),
                ...rulesWithBabelRequirement(true),
            },
            rulesWithBabelRequirement(false),
        ],
    };
};

export const less = (entry: BuildEntry): RuleSetRule => {
    const {cwd, usage, projectSettings: {build: {style: {modules, extract}}}} = entry;
    const use = createUseWith(entry);
    const finalLoader = (usage === 'build' && extract) ? 'cssExtract' : 'style';

    return {
        test: /\.less$/,
        oneOf: [
            {
                test: /\.global\.less$/,
                use: use(finalLoader, 'css', 'postCSS', 'less', 'styleResources'),
            },
            {
                resource: normalizeRuleMatch(cwd, modules),
                use: use('classNames', finalLoader, 'cssModules', 'postCSSModules', 'less', 'styleResources'),
            },
            {
                use: use(finalLoader, 'css', 'postCSS', 'less', 'styleResources'),
            },
        ],
    };
};

export const css = (entry: BuildEntry): RuleSetRule => {
    const {cwd, usage, projectSettings: {build: {style: {modules, extract}}}} = entry;
    const use = createUseWith(entry);
    const finalLoader = (usage === 'build' && extract) ? 'cssExtract' : 'style';

    return {
        test: /\.css$/,
        oneOf: [
            {
                test: /\.global\.css$/,
                use: use(finalLoader, 'css', 'postCSS'),
            },
            {
                resource: normalizeRuleMatch(cwd, modules),
                use: use('classNames', finalLoader, 'cssModules', 'postCSSModules'),
            },
            {
                use: use(finalLoader, 'css', 'postCSS'),
            },
        ],
    };
};

export const image = (entry: BuildEntry): RuleSetRule => {
    const use = createUseWith(entry);

    return {
        test: /\.(jpe?g|png|gif)$/i,
        use: use('url', 'img'),
    };
};

export const svg = (entry: BuildEntry): RuleSetRule => {
    const {mode} = entry;
    const use = createUseWith(entry);

    return {
        test: /\.svg$/,
        use: use('svg', mode === 'production' && 'svgo'),
    };
};

export const file = (entry: BuildEntry): RuleSetRule => {
    const use = createUseWith(entry);

    return {
        test: /\.(eot|ttf|woff|woff2)(\?.+)?$/,
        use: use('url'),
    };
};
