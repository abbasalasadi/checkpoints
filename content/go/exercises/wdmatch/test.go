package main

import (
	"strings"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/chars"
	"github.com/01-edu/module/test-images/test-go/lib/random"
)

func main() {
	table := append(random.StrSlice(chars.Words),
		" ",
		"123 123",
		"abc abc",
		"ac abc",
		"13 123",
		"faya fgvvfdxcacpolhyghbreda",
		"faya fgvvfdxcacpolhyghbred",
		"error rrerrrfiiljdfxjyuifrrvcoojh",
		"error rrerrrfiiljdfxjyuifrrvcoojrh",
	)

	for _, s := range table {
		challenge.Program("wdmatch", strings.Fields(s)...)
	}
}
