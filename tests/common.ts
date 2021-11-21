import * as path from 'path'
import { slurp } from '../src/util'


export const TEST_DATA_DIR = path.join(path.dirname(__filename), '..', 'src/testdata')

export function getTestFilePath(testFileName: string): string {
    return path.join(TEST_DATA_DIR, testFileName)
}

export function slurpTestData(testFileName: string) {
    return slurp(getTestFilePath(testFileName))
}