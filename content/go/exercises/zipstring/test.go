package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	args := []string{
		"aaaa",
		"zzzzzZZZZZZ",
		"",
		"ziiiiipMeee",
		"hhellloTthereYouuunggFelllas",
	}

	for _, arg := range args {
		challenge.Function("ZipString", student.ZipString, solutions.ZipString, arg)
	}
}
