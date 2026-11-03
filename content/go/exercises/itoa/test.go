package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/random"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	for i := 0; i < 50; i++ {
		challenge.Function("Itoa", student.Itoa, solutions.Itoa, random.Int())
	}
}
