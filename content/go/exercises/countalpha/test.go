package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	params := []string{
		"a",
		"abc",
		"",
		"H E L L O",
		"A1B2C3D4B5DE6",
		"a1b2c3d4b5de6",
		"A1b2C3D4B5De6",
		"1234",
		"    ",
	}

	for _, param := range params {
		challenge.Function("CountAlpha", student.CountAlpha, solutions.CountAlpha, param)
	}
}
