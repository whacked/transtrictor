package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io/ioutil"
	"log"
	"os"

	"github.com/google/go-jsonnet"
	"github.com/imdario/mergo"
	"github.com/qri-io/jsonschema"
)

func JsonnetFilePathToJsonString(jsonnetFilePath string) string {
	sourceJsonnet, err := ioutil.ReadFile(jsonnetFilePath)
	if err != nil {
		log.Fatalf("failed to load data from file %s", jsonnetFilePath)
	}
	return JsonnetStringToJsonString(string(sourceJsonnet))
}

func JsonnetStringToJsonString(jsonnetString string) string {
	vm := jsonnet.MakeVM()
	jsonStr, err := vm.EvaluateAnonymousSnippet("dummyFile.jsonnet", jsonnetString)
	if err != nil {
		log.Fatal(err)
	}
	return jsonStr
}

func MakeHydratedStructWithDefaultsFromSchema(jsonSchemaStruct *map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{})
	parseMap(*jsonSchemaStruct, &out)
	return out
}

func parseMap(inputMap map[string]interface{}, outDataMap *map[string]interface{}) {
	workingMap := *outDataMap

	if inputMap["type"] == "object" {
		nextInputMap := inputMap["properties"].(map[string]interface{})
		parseMap(nextInputMap, outDataMap)
	} else {
		for key, val := range inputMap {
			valMap := val.(map[string]interface{})
			if defaultValue, ok := valMap["default"]; ok {
				workingMap[key] = defaultValue
			} else if valMap["type"] == "object" {
				nextWorkingMap := make(map[string]interface{})
				workingMap[key] = nextWorkingMap
				parseMap(valMap, &nextWorkingMap)
			} else if valMap["type"] == "array" {
				valSubMap := valMap["items"].(map[string]interface{})
				switch tt := valSubMap["type"]; tt {
				case "number":
					workingMap[key] = []float64{}
				case "string":
					workingMap[key] = []string{}
				case "boolean":
					workingMap[key] = []bool{}
				}
			} else {
				workingMap[key] = nil
			}
		}
	}
}

func main() {

	if len(os.Args) < 2 {
		log.Fatalf("USAGE ERROR:  needs  <schema json[net] file> <input json[net] file | stdin>")
	}

	jscmSourceJson := JsonnetFilePathToJsonString(os.Args[1])
	var jsonSchemaStruct map[string]interface{}
	json.Unmarshal([]byte(jscmSourceJson), &jsonSchemaStruct)
	defaultSourceData := MakeHydratedStructWithDefaultsFromSchema(&jsonSchemaStruct)

	var mergeTargetJson string
	if len(os.Args) > 2 {
		mergeTargetJson = JsonnetFilePathToJsonString(os.Args[2])
	} else {
		stdinInput, err := ioutil.ReadAll(os.Stdin)
		if err != nil {
			panic(err)
		}
		mergeTargetJson = JsonnetStringToJsonString(string(stdinInput))
	}

	var mergeTargetJsonStruct map[string]interface{}
	json.Unmarshal([]byte(mergeTargetJson), &mergeTargetJsonStruct)

	mergo.Merge(&mergeTargetJsonStruct, defaultSourceData)

	renderedBytes, err := json.MarshalIndent(mergeTargetJsonStruct, "", "    ")

	validatorSchema := &jsonschema.Schema{}
	if err := json.Unmarshal([]byte(jscmSourceJson), validatorSchema); err != nil {
		panic("unmarshal schema: " + err.Error())
	}

	validatorContext := context.Background()
	errs, err := validatorSchema.ValidateBytes(validatorContext, renderedBytes)
	if err != nil {
		panic(err)
	}
	if len(errs) > 0 {
		fmt.Fprintln(os.Stderr, errs[0].Error())
	} else {
		fmt.Fprintln(os.Stdout, string(renderedBytes))
	}
}
