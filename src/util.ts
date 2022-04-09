import fs from 'fs'
import path from 'path'
import chalk from 'chalk'
import memoizerific from 'memoizerific'
import { sha256HexString } from './defs'
import crypto from 'crypto'
import { canonicalize as toCanonicalizedJson } from 'json-canonicalize'


export function isEmpty(maybeString: string) {
    return maybeString == null || maybeString.trim().length == 0
}

export function readStdin(): Promise<string> {
    process.stdin.resume();
    process.stdin.setEncoding('utf-8');
    let readBuffer: string = ''
    return new Promise((resolve, reject) => {
        process.stdin.on('data', inputData => {
            readBuffer += inputData
        })
        process.stdin.on('end', _ => {
            resolve(readBuffer)
        })
    })
}

export function bailIfNull<T>(maybeNull: T): T {
    if (maybeNull == null) {
        throw new Error('this value must not be null')
    }
    return maybeNull
}

export function bailIfNotExists(filePath: string) {
    if (!fs.existsSync(filePath)) {
        throw new Error(`file "${filePath}" does not exist`)
    }
}

export function slurp(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}

export function identity(x: any) {
    return x
}

let isPatched = false;
export function monkeyPatchConsole() {
    if (isPatched) {
        return
    } else {
        // console.warn('applying console monkey patch...')
    }

    // ref https://stackoverflow.com/a/47296370
    ['log', 'warn', 'error'].forEach((methodName) => {
        const originalMethod = console[methodName];
        const projectDir = process.cwd()
        console[methodName] = (...args) => {
            let initiator = 'unknown place';
            try {
                throw new Error();
            } catch (e) {
                if (typeof e.stack === 'string') {
                    let isFirst = true;
                    for (const line of e.stack.split('\n')) {
                        const matches = line.match(/^\s+at\s+(.*)/);
                        if (matches) {
                            if (!isFirst) { // first line - current function
                                // second line - caller (what we are looking for)
                                initiator = path.relative(projectDir, matches[1]);
                                break;
                            }
                            isFirst = false;
                        }
                    }
                }
            }
            let coloredInitiator = initiator
            switch (methodName) {
                case 'warn':
                    coloredInitiator = chalk.yellow(initiator)
                    break
                case 'error':
                    coloredInitiator = chalk.bgRed.white(initiator)
                    break
                default:
                    coloredInitiator = chalk.cyan(initiator)
                    break
            }
            originalMethod.apply(console, [`${coloredInitiator} `, ...args]);
        };
    });
    isPatched = true;
}

export const getSha256 = memoizerific(1000)((content: string): sha256HexString => {
    return crypto.createHash('sha256').update(content).digest('hex')
})

export function getJcsSha256(data: any): string {
    return getSha256(toCanonicalizedJson(data))
}

export function toSha256Checksum(data: any): string {
    return `sha256:${getJcsSha256(data)}`
}