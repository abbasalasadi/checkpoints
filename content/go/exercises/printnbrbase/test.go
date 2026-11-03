// Authored locally in the upstream idiom — ghcr.io/01-edu/module-go has no
// tests/printnbrbase_test. challenge.Function compares both the return values
// and everything the function wrote to stdout, which is what this exercise is.
package main

import (
	student "student"

	"github.com/01-edu/module/test-images/test-go/lib/base"
	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/random"
	"github.com/01-edu/module/test-images/test-go/solutions"
)

func main() {
	fixed := []struct {
		nbr     int
		charset string
	}{
		{125, "0123456789"},
		{-125, "01"},
		{125, "0123456789ABCDEF"},
		{-125, "choumi"},
		{125, "aa"},
		{0, "01"},
		{0, "0123456789ABCDEF"},
		{-1, "0123456789"},
		{random.MinInt, "0123456789"},
		{random.MaxInt, "0123456789ABCDEF"},
		{42, ""},
		{42, "0"},
		{42, "01+"},
		{42, "01-"},
		{42, "0101"},
	}

	for _, tc := range fixed {
		challenge.Function("PrintNbrBase", student.PrintNbrBase, solutions.PrintNbrBase, tc.nbr, tc.charset)
	}

	for i := 0; i < 20; i++ {
		challenge.Function("PrintNbrBase", student.PrintNbrBase, solutions.PrintNbrBase,
			random.IntBetween(-1000000, 1000000), base.Valid())
	}

	for i := 0; i < 5; i++ {
		challenge.Function("PrintNbrBase", student.PrintNbrBase, solutions.PrintNbrBase,
			random.Int(), base.Invalid())
	}
}
