package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	table := []string{"First second last", "     ", " Bleach ", " Attack on Titan", "Spy X Family", "Z", "email123@live.fr", "write  ==> 45m$", "-552", "w58tw7474abc", "fifa world cup `2022`"}
	for _, s := range table {
		challenge.Function("WordFlip", student.WordFlip, solutions.WordFlip, s)
	}
}
