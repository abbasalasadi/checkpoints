package main

import (
	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/chars"
	"github.com/01-edu/module/test-images/test-go/lib/random"
)

func main() {
	args := []string{
		"abc   ",
		"Let there     be light",
		"     AkjhZ zLKIJz , 23y",
		"",
	}
	args = append(args, random.StrSlice(chars.Words)...)

	for _, arg := range args {
		challenge.Program("rostring", arg)
	}
	challenge.Program("rostring")
	challenge.Program("rostring", "this", "is")
	challenge.Program("rostring", "not", "good", "for  you")
}
