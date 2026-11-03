package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/random"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	args := append(random.IntSliceBetween(0, 99999), 5, 4, 1, 0)
	for _, arg := range args {
		challenge.Function("FindPrevPrime", student.FindPrevPrime, solutions.FindPrevPrime, arg)
	}
}
