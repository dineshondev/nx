import { CypressComponentProjectSchema } from './schema';
import {
  addDependenciesToPackageJson,
  formatFiles,
  generateFiles,
  joinPathFragments,
  offsetFromRoot,
  ProjectConfiguration,
  readProjectConfiguration,
  Tree,
  updateJson,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import {
  cypressReactVersion,
  cypressVersion,
  cypressWebpackVersion,
  swcCoreVersion,
  swcLoaderVersion,
  webpackHttpPluginVersion,
} from '../../utils/versions';

import { CYPRESS_COMPONENT_TEST_TARGET } from '../../utils/project-name';
import {
  ComponentTestingProjectState,
  cypressComponentTestingState,
} from '../utils/verify-cypress-component-project';

export async function cypressComponentProject(
  tree: Tree,
  options: CypressComponentProjectSchema
) {
  const projectConfig = readProjectConfiguration(tree, options.project);

  const cypressState = cypressComponentTestingState(tree, projectConfig, {
    force: options.force,
  });

  let installDepsTask;
  switch (cypressState) {
    case ComponentTestingProjectState.INSTALL:
      installDepsTask = updateDeps(tree, options, true);
      break;
    case ComponentTestingProjectState.NO_INSTALL:
      installDepsTask = updateDeps(tree, options, false);
      break;
    case ComponentTestingProjectState.ALREADY_SETUP:
      throw new Error(
        'The project already has a cypress component testing target. Please use the --force flag to overwrite the existing project.'
      );
    case ComponentTestingProjectState.UPGRADE:
      throw new Error(
        'Cypress version of 10 or higher is required to create a component testing project'
      );
    default:
      throw new Error(
        `Unable to determine if project is able to use Cypress component testing`
      );
  }

  addProjectFiles(tree, projectConfig, options);
  updateTSConfig(tree, projectConfig);
  addTargetToProject(projectConfig, tree, options);

  return () => {
    formatFiles(tree);
    installDepsTask();
  };
}

function updateDeps(
  tree: Tree,
  options: CypressComponentProjectSchema,
  shouldInstallCypress: boolean
) {
  const devDeps = {
    '@cypress/webpack-dev-server': cypressWebpackVersion,
    'html-webpack-plugin': webpackHttpPluginVersion,
  };

  if (shouldInstallCypress) {
    devDeps['cypress'] = cypressVersion;
  }

  if (options.componentType === 'react' || options.componentType === 'next') {
    devDeps['@cypress/react'] = cypressReactVersion;
    if (options.compiler === 'swc') {
      devDeps['@swc/core'] = swcCoreVersion;
      devDeps['swc-loader'] = swcLoaderVersion;
    }
  }
  return addDependenciesToPackageJson(tree, {}, devDeps);
}

function addProjectFiles(
  tree: Tree,
  projectConfig: ProjectConfiguration,
  options: CypressComponentProjectSchema
) {
  // prevent overwriting the existing next.config.js, though there shouldn't be a reason for a next.config.js exist within a library project.
  const nextConfigPath = joinPathFragments(
    projectConfig.root,
    'next.config.js'
  );
  if (tree.exists(nextConfigPath)) {
    // TODO(caleb) add .next to ignored files
    //  and make sure it's not in the final bundle
    //  if it's a buildable/publishable project
    tree.rename(nextConfigPath, `${nextConfigPath}.bak`);
  }

  // generate base project files
  generateFiles(
    tree,
    joinPathFragments(__dirname, 'files'),
    projectConfig.root,
    {
      ...options,
      projectRoot: projectConfig.root,
      offsetFromRoot: offsetFromRoot(projectConfig.root),
      ext: '',
    }
  );

  if (options.componentType !== 'next') {
    tree.delete(joinPathFragments(projectConfig.root, 'next.config.js'));
  }

  if (tree.exists(`${nextConfigPath}.bak`)) {
    tree.rename(`${nextConfigPath}.bak`, nextConfigPath);
  }
}

function updateTSConfig(tree: Tree, projectConfig: ProjectConfiguration) {
  const projectTsConfigPath = joinPathFragments(
    projectConfig.root,
    'tsconfig.json'
  );
  if (!tree.exists(projectTsConfigPath)) {
    throw new Error(
      `Expected project tsconfig.json to exist. Please create one. Expected ${projectTsConfigPath} to exist. Found none.`
    );
  }

  updateJson(tree, projectTsConfigPath, (json) => {
    json.references = json.references || [];
    json.references.push({ path: './tsconfig.cy.json' });
    return json;
  });

  // we need to ignore the cypress files otherwise the build will fail
  // attempt to grab the tsconfig used for building.
  // TODO(caleb): should we log a message if we don't find one to be safe?
  //  would only happen if it's added to an existing project that has changed the defaults
  const buildTsConfig = projectConfig.targets?.['build']?.options?.tsConfig;

  if (buildTsConfig) {
    updateJson(tree, buildTsConfig, (json) => {
      json.exclude = Array.from(
        new Set([
          ...(json.exclude || []),
          'cypress/**/*',
          'cypress.config.ts',
          '**/*.cy.ts',
          '**/*.cy.js',
          '**/*.cy.tsx',
          '**/*.cy.jsx',
        ])
      );
      return json;
    });
  }
}

function addTargetToProject(
  projectConfig: ProjectConfiguration,
  tree: Tree,
  options: CypressComponentProjectSchema
) {
  projectConfig.targets[CYPRESS_COMPONENT_TEST_TARGET] = {
    executor: '@nrwl/cypress:cypress',
    options: {
      cypressConfig: joinPathFragments(projectConfig.root, 'cypress.config.ts'),
      testingType: 'component',
    },
  };

  updateProjectConfiguration(tree, options.project, projectConfig);
}
