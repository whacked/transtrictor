import fastGlob from 'fast-glob'
import fs from "fs"
import path from "path"
import { FileInfo } from '../autogen/interfaces/anthology/2022/02/26/FileInfo'
import { TypedSchemaTaggedPayload } from '../autogen/interfaces/anthology/2022/03/25/SchemaTaggedPayload'
import { makeSchemaTaggedPayloadTransformerFunction } from "./interface"


export function getFileStats(filePath: string): FileInfo {
    let fileStat = fs.statSync(filePath)
    return {
        filepath: filePath,
        size: fileStat.size,
        mtime: fileStat.mtime.getTime(),
    }
}

export async function getDirectoryFileStats(baseDir: string): Promise<Array<FileInfo>> {
    return fastGlob(['**/*'], {
        cwd: baseDir,
        absolute: true,
    }).then((matches) => {
        return matches.map((filePath) => {
            return {
                ...getFileStats(filePath),
                name: path.relative(baseDir, filePath),
            }
        })
    })
}

export async function getDirectoryFileStatsAsTaggedPayloads(baseDir: string): Promise<Array<TypedSchemaTaggedPayload<FileInfo>>> {
    let doTransform = makeSchemaTaggedPayloadTransformerFunction<FileInfo>(
        'FileInfo', '2022-03-25.1')

    return getDirectoryFileStats(baseDir).then((matches) => {
        return Promise.all(matches.map((match) => {
            return doTransform(match)
        }))
    })
}


if (require.main == module) {
    getDirectoryFileStatsAsTaggedPayloads('.').then((matches) => {
        for (const match of matches.slice(0, 2)) {
            console.log(match)
        }
    })
}
