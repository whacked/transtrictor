import React, {
    useState,
    useEffect,
    PureComponent,
} from 'react'
import ReactDOM from 'react-dom'
import 'prismjs'  // without this, import Prism throws "Uncaught ReferenceError: Prism is not defined"
import Prism from 'prismjs'
import 'prismjs/components/prism-json'
import 'prismjs/themes/prism.css'
import ReactDiffViewer from 'react-diff-viewer';
import ReactJson from 'react-json-view';
import * as jsondiffpatch from 'jsondiffpatch'
import 'jsondiffpatch/dist/formatters-styles/html.css'
import 'jsondiffpatch/dist/formatters-styles/annotated.css'
import {
    DATASET_TABLE_NAME, SchemaStatistic, SCHEMA_TABLE_NAME,
} from '../src/defs'

export interface ExtendedResponse {
    schemaHash: string,
    data: any,
}


async function dbGet<ResponseInterface>(databaseName: string, requestString: string = '', params?: any): Promise<ResponseInterface> {
    // example: dbGet<PouchDB.Core.DatabaseInfo>(...)
    let baseEndpoint = `/api/${databaseName}`
    if (requestString.length > 0) {
        baseEndpoint = `${baseEndpoint}/${requestString}`
    }
    if (params != null) {
        baseEndpoint = `${baseEndpoint}?${new URLSearchParams(params).toString()}`
    }
    return fetch(baseEndpoint).then((response) => {
        return response.json()
    })
}

async function dbGetAllDocuments<T>(databaseName: string) {
    return dbGet<PouchDB.Core.AllDocsResponse<T>>(databaseName, '_all_docs', {
        include_docs: true,
    })
}

async function dbFindDocumentsWithSchemaHash<T>(databaseName: string, schemaHash: string): Promise<T> {
    return fetch(
        `/api/${databaseName}/_find`,
        {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                selector: {
                    schemaHash,
                }
            })
        }).then((response) => {
            return response.json()
        }).then((result) => {
            if (result.warning != null) {
                console.warn(result.warning)
            }
            return result.docs
        })
}

async function dbGetDataDocumentsWithSchemaHash(hash: string) {
    return dbFindDocumentsWithSchemaHash<ExtendedResponse[]>(DATASET_TABLE_NAME, hash)
}

async function loadDocument<T>(databaseName: string, id: string, revLookupObject?: any, updateRevLookupObject?: Function): Promise<T> {
    if (revLookupObject != null && revLookupObject[id] != null) {
        return revLookupObject[id]
    }

    return dbGet<T>(databaseName, id).then(response => {
        if (revLookupObject != null && updateRevLookupObject != null) {
            updateRevLookupObject({
                ...revLookupObject,
                [id]: response,
            })
        }
        return response
    })
}

interface IDiffComponentProps {
    oldValue: string,
    newValue: string,
}
class Diff extends PureComponent<IDiffComponentProps> {
    highlightSyntax = (code: string) => (
        <pre
            style={{ display: 'inline' }}
            dangerouslySetInnerHTML={{
                __html: code == null ? '' : Prism.highlight(code, Prism.languages.json, 'json'),
            }}
        />
    );

    render = () => {
        return (
            <ReactDiffViewer
                oldValue={this.props.oldValue}
                newValue={this.props.newValue}
                splitView={true}
                renderContent={this.highlightSyntax}
            />
        );
    };
}


const MainComponent = () => {
    const [documents, setDocuments] = useState<Array<SchemaStatistic>>([]);
    const [documentLookup, setDocumentLookup] = useState<Record<string, any>>({})

    const [activeSchemaStatistic, setActiveSchemaStatistic] = useState<SchemaStatistic>(null)
    const [leftDocument, setLeftDocument] = useState<any>(null)
    const [rightDocument, setRightDocument] = useState<any>(null)
    const [visualDiffHtml, setVisualDiffHtml] = useState<string>('')
    const [dataScrubberRecords, setDataScrubberRecords] = useState<Array<any>>([])
    const [focusedDataScrubberIndex, setFocusedDataScrubberIndex] = useState<number>(0)

    useEffect(() => {
        dbGetAllDocuments<SchemaStatistic>(SCHEMA_TABLE_NAME).then((response) => {
            return response.rows
        }).then((rows): Array<SchemaStatistic> => {
            return rows.map((dbRow) => {
                return {
                    ...dbRow.doc,
                    dbRecord: dbRow,
                }
            })
        }).then((docs: Array<SchemaStatistic>) => {
            setDocuments(docs)

            let newDocumentLookup = { ...documentLookup }
            docs.forEach((doc) => {
                newDocumentLookup[doc.dbRecord.id] = doc
            })
            setDocumentLookup(newDocumentLookup)
        })
    }, [])

    useEffect(() => {
        if (leftDocument == null || rightDocument == null) {
            return
        }
        let delta = jsondiffpatch.diff(leftDocument, rightDocument)
        setVisualDiffHtml(jsondiffpatch.formatters.html.format(delta, leftDocument))
    }, [leftDocument, rightDocument])

    let setComparisonDocument = (id: string, setter: Function) => {
        loadDocument(SCHEMA_TABLE_NAME, id, documentLookup, setDocumentLookup).then((document: SchemaStatistic) => {
            let reifiedSchema = JSON.parse(document.sourceCode)
            setter(reifiedSchema)
            return document
        })
    }

    let setLeftDocumentOnClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        setComparisonDocument(event.target.value, setLeftDocument)
    }

    let setRightDocumentOnClick = (event: React.ChangeEvent<HTMLInputElement>) => {
        setComparisonDocument(event.target.value, setRightDocument)
    }

    return (
        <div>
            <table style={{
                border: '1px solid black',
            }}>
                <thead>
                    <tr>
                        <th>index</th>
                        <th>L</th>
                        <th>R</th>
                        <th>rev</th>
                        <th>hash</th>
                        <th>total</th>
                        <th>first appeared</th>
                        <th>last appeared</th>
                    </tr>
                </thead>
                <tbody>
                    {documents.map((doc, index) => {
                        return (
                            <tr key={`tr-${index}`}>
                                <td>
                                    {index}
                                </td>
                                <td>
                                    <input type='radio' name='displayLeft'
                                        onChange={setLeftDocumentOnClick}
                                        value={doc.dbRecord.id} />
                                </td>
                                <td>

                                    <input type='radio' name='displayRight'
                                        onChange={setRightDocumentOnClick}
                                        value={doc.dbRecord.id} />
                                </td>
                                <td>
                                    <span
                                        style={{
                                            fontFamily: 'monospace',
                                        }}
                                        title={`${doc.dbRecord.value.rev}`}
                                    >
                                        {doc.dbRecord.value.rev.substring(0, 8)}
                                    </span>
                                </td>
                                <td>
                                    <button
                                        onClick={(event) => {
                                            setActiveSchemaStatistic(doc)
                                            dbGetDataDocumentsWithSchemaHash(doc.schemaHash).then((extendedResponses) => {
                                                setDataScrubberRecords(extendedResponses.map((extendedResponse) => {
                                                    return extendedResponse.data
                                                }))
                                            })
                                        }}>
                                        {doc.schemaHash.substring(0, 8)}
                                    </button>
                                </td>
                                <td>
                                    {doc.total}
                                </td>
                                <td>
                                    {doc.firstAppearedAt}
                                </td>
                                <td>
                                    {doc.lastAppearedAt}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
            {
                activeSchemaStatistic == null
                    ? null
                    : (
                        <>
                            <div>
                                <code>selected schema: {activeSchemaStatistic.schemaHash}</code>
                            </div>
                            {
                                dataScrubberRecords.length == 0
                                    ? null
                                    : (
                                        <div>
                                            <input type='range'
                                                value={focusedDataScrubberIndex + 1}
                                                min={1}
                                                max={dataScrubberRecords.length}
                                                onChange={(event) => {
                                                    let index = parseInt(event.target.value) - 1
                                                    setFocusedDataScrubberIndex(index)
                                                }}
                                            />
                                            <code>{focusedDataScrubberIndex + 1} of {dataScrubberRecords.length} records</code>
                                        </div>
                                    )
                            }
                            {
                                dataScrubberRecords.length == 0
                                    ? null
                                    : (
                                        <ReactJson src={dataScrubberRecords[focusedDataScrubberIndex]} />
                                    )
                            }
                        </>
                    )
            }
            <div
                style={{
                    display: 'flex',
                    border: '1px solid black',
                }}
                dangerouslySetInnerHTML={{ __html: visualDiffHtml }}></div>
            {
                (leftDocument == null || rightDocument == null)
                    ? null
                    : (
                        <div
                            style={{
                                display: 'flex',
                                border: '1px solid blue',
                            }}
                        >
                            <Diff
                                oldValue={JSON.stringify(leftDocument, null, 2)}
                                newValue={JSON.stringify(rightDocument, null, 2)}
                            />
                        </div>
                    )
            }
        </div >
    )
}

window.addEventListener('DOMContentLoaded', (_event) => {
    ReactDOM.render((
        <MainComponent />
    ), document.getElementById("app"))
})