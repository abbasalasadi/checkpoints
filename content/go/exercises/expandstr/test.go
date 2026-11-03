package main

import (
	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/chars"
	"github.com/01-edu/module/test-images/test-go/lib/random"
)

func main() {
	args := [][]string{
		{"hello", "you"},
		{"   only  it's harder   "},
		{"you   see   it's   easy   to   display    the     same  thing"},
	}

	args = append(args, random.StrSlice(chars.Words))

	for _, v := range args {
		challenge.Program("expandstr", v...)
	}
	challenge.Program("expandstr")
}
