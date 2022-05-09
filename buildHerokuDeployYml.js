const fs = require('fs');
const { parse } = require('dotenv');
const YAML = require('yaml');

const encoding = 'utf8';

const dotEnv = parse(fs.readFileSync('.env.example', { encoding }));

const ymlPath = '.github/workflows/heroku-deploy.yml';

const yaml = YAML.parse(fs.readFileSync(ymlPath, encoding));

const steps = yaml.jobs.build.steps;

const stepRegex = /akhileshns\/heroku-deploy*/;
const stepIndex = steps.findIndex((step) => stepRegex.test(step.uses));
const herokuDeployStep = steps[stepIndex];

herokuDeployStep.env = mergeDotenvIntoYaml(dotEnv, herokuDeployStep.env);

function mergeDotenvIntoYaml(dotEnv, yamlEnv) {
  const ret = yamlEnv;

  Object.keys(dotEnv).forEach((key) => {
    ret[`HD_${key}`] = `\${{secrets.${key}}}`;
  });

  return ret;
}

steps[stepIndex] = herokuDeployStep;
yaml.jobs.build.steps = steps;

fs.writeFileSync(ymlPath, YAML.stringify(yaml), { encoding });
