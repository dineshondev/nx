import {
  addProjectConfiguration,
  ProjectConfiguration,
  readProjectConfiguration,
  Tree,
  updateProjectConfiguration,
} from '@nrwl/devkit';
import { createTreeWithEmptyWorkspace } from '@nrwl/devkit/testing';
import { cypressComponentProject } from './cypress-component-project';
import { CYPRESS_COMPONENT_TEST_TARGET } from '../../utils/project-name';
import {
  ComponentTestingProjectState,
  cypressComponentTestingState,
} from '../utils/verify-cypress-component-project';

jest.mock('../utils/verify-cypress-component-project');
let projectConfig: ProjectConfiguration = {
  projectType: 'library',
  sourceRoot: 'libs/cool-lib/src',
  root: 'libs/cool-lib',
  targets: {
    test: {
      executor: '@nrwl/jest:jest',
      options: {
        jestConfig: 'libs/cool-lib/jest.config.js',
      },
    },
  },
};
describe('Cypress Component Project', () => {
  let tree: Tree;
  let mockedProjectState: jest.Mock<
    ReturnType<typeof cypressComponentTestingState>
  > = cypressComponentTestingState as never;

  beforeEach(() => {
    tree = createTreeWithEmptyWorkspace();
    addProjectConfiguration(tree, 'cool-lib', projectConfig);
    tree.write(
      'libs/cool-lib/tsconfig.json',
      `
{
  "references": [
    {
      "path": "./tsconfig.lib.json"
    },
    {
      "path": "./tsconfig.spec.json"
    }
  ]
}
`
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('validation', () => {
    it('should not be able to create project with < cypress v9 installed', async () => {
      mockedProjectState.mockReturnValue(ComponentTestingProjectState.UPGRADE);
      try {
        await cypressComponentProject(tree, {
          project: 'cool-lib',
          compiler: 'swc',
          componentType: 'react',
          force: false,
        });
        // make sure we reject to prevent the test from passing if an error isn't thrown
        return Promise.reject(
          'cypressComponentProject should have throw an error when cypress version requires an upgrade'
        );
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it('should throw an error if cypress project is already created', async () => {
      mockedProjectState.mockReturnValue(
        ComponentTestingProjectState.ALREADY_SETUP
      );
      tree.write('libs/cool-lib/cypress.config.ts', '');
      try {
        await cypressComponentProject(tree, {
          project: 'cool-lib',
          compiler: 'swc',
          componentType: 'react',
          force: false,
        });
        return Promise.reject(
          'cypressComponentProject should have throw an error when cypress project is already created'
        );
      } catch (e) {
        expect(e).toMatchSnapshot();
      }
    });

    it('should create cypress project over existing with --force', async () => {
      mockedProjectState.mockReturnValue(ComponentTestingProjectState.INSTALL);
      tree.write('libs/cool-lib/cypress.config.ts', '');
      const newTarget = {
        [CYPRESS_COMPONENT_TEST_TARGET]: {
          executor: '@nrwl/cypress:cypress',
          options: {
            cypressConfig: 'libs/cool-lib/cypress.config.ts',
            testingType: 'component',
          },
        },
      };
      updateProjectConfiguration(tree, 'cool-lib', {
        ...projectConfig,
        targets: {
          ...projectConfig.targets,
          ...newTarget,
        },
      });

      await cypressComponentProject(tree, {
        project: 'cool-lib',
        compiler: 'swc',
        componentType: 'react',
        force: true,
      });
      const actualProjectConfig = readProjectConfiguration(tree, 'cool-lib');

      expect(tree.exists('libs/cool-lib/cypress.config.ts')).toEqual(true);
      expect(tree.exists('libs/cool-lib/cypress')).toEqual(true);
      expect(tree.exists('libs/cool-lib/tsconfig.cy.json')).toEqual(true);
      expect(
        actualProjectConfig.targets[CYPRESS_COMPONENT_TEST_TARGET]
      ).toMatchSnapshot();
    });
  });

  describe('react', () => {
    beforeEach(() => {
      mockedProjectState.mockReturnValue(ComponentTestingProjectState.INSTALL);
    });
    it('should create project w/babel', async () => {
      tree.delete('libs/cool-lib/cypress.config.ts');
      await cypressComponentProject(tree, {
        project: 'cool-lib',
        compiler: 'babel',
        componentType: 'react',
        force: false,
      });
      const actualProjectConfig = readProjectConfiguration(tree, 'cool-lib');

      expect(tree.exists('libs/cool-lib/cypress.config.ts')).toEqual(true);
      expect(tree.exists('libs/cool-lib/cypress')).toEqual(true);
      expect(tree.exists('libs/cool-lib/tsconfig.cy.json')).toEqual(true);
      expect(
        actualProjectConfig.targets[CYPRESS_COMPONENT_TEST_TARGET]
      ).toMatchSnapshot();
    });

    it('should create project w/swc', async () => {
      tree.delete('libs/cool-lib/cypress.config.ts');
      await cypressComponentProject(tree, {
        project: 'cool-lib',
        compiler: 'swc',
        componentType: 'react',
        force: false,
      });

      const actualProjectConfig = readProjectConfiguration(tree, 'cool-lib');

      expect(tree.exists('libs/cool-lib/cypress.config.ts')).toEqual(true);
      expect(tree.exists('libs/cool-lib/cypress')).toEqual(true);
      expect(tree.exists('libs/cool-lib/tsconfig.cy.json')).toEqual(true);
      expect(
        actualProjectConfig.targets[CYPRESS_COMPONENT_TEST_TARGET]
      ).toMatchSnapshot();
    });
  });
});
