import fs from 'fs'


export function slurp(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8')
}


export function identity(x: any) {
    return x
}