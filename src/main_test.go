package main

import (
	"encoding/json"
	"io/ioutil"
	"strings"
	"testing"
)

func PanicIfError(maybeError error) {
	if maybeError != nil {
		panic("got error!")
	}
}

func TestHydration(t *testing.T) {

	jscmSourceJson := JsonnetFilePathToJsonString("testdata/sample-schema.jsonnet")

	var jsonSchemaStruct map[string]interface{}
	json.Unmarshal([]byte(jscmSourceJson), &jsonSchemaStruct)

	hydratedStruct := MakeHydratedStructWithDefaultsFromSchema(&jsonSchemaStruct)

	receivedOutputBytes, err := json.MarshalIndent(hydratedStruct, "", "    ")
	PanicIfError(err)
	receivedOutput := string(receivedOutputBytes)

	expectedOutputBytes, err := ioutil.ReadFile("testdata/sample-schema-hydrated.json")
	PanicIfError(err)
	expectedOutput := strings.TrimSpace(string(expectedOutputBytes))

	if receivedOutput != expectedOutput {
		t.Fatalf("expected\n^%s$\nbut received\n^%s$\n", expectedOutput, receivedOutput)
	}
}
