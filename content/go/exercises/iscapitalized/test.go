package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	table := []string{
		"Hello! €How are you?",
		"a",
		"z",
		"!",
		"Hello How Are 4you",
		"What's this 4?",
		"Whatsthis4",
		"abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890",
		"131!",
		"H3110 W0r1d!",
		"",
		" ",
	}

	for _, arg := range table {
		challenge.Function("IsCapitalized", student.IsCapitalized, solutions.IsCapitalized, arg)
	}
}
