package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	table := []string{"First78last", "     ", " 280jsl", "he", "", "honey!", "Z", "email123@live.fr", "w45m$", "-552", "474abc", "<=>"}
	for _, s := range table {
		challenge.Function("PrintIf", student.PrintIf, solutions.PrintIf, s)
	}
}
