package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	table := []string{"1234556789", "e 5£ @ 8* 7 =56 ;", "QKplq%QSw", "", "hello \\! n4ght cr3a8ure7 ", "Kimetsu no Yaiba", "8595485-52", "-552", "w58tw7474abc", "Po65 4o"}
	for _, s := range table {
		challenge.Function("FifthAndSkip", student.FifthAndSkip, solutions.FifthAndSkip, s)
	}
}
