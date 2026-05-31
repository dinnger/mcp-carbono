import { resolve } from "node:path";

const { CARBONO_WORKSPACE_DIR, CARBONO_PUPPETEER_EXECUTABLE } = process.env;

const WORKSPACE_DIR = resolve(CARBONO_WORKSPACE_DIR ?? "./workspace");
const PUPPETEER_EXECUTABLE = CARBONO_PUPPETEER_EXECUTABLE;

export const envs = {
	WORKSPACE_DIR,
	PUPPETEER_EXECUTABLE,
};
