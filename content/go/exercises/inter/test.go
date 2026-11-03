package main

import (
	"strings"

	"github.com/01-edu/module/test-images/test-go/lib/challenge"
	"github.com/01-edu/module/test-images/test-go/lib/chars"
	"github.com/01-edu/module/test-images/test-go/lib/random"
)

func main() {
	args := append(random.StrSlice(chars.Words),
		"padinton paqefwtdjetyiytjneytjoeyjnejeyj",
		"ddf6vewg64f  twthgdwthdwfteewhrtag6h4ffdhsd",
		"abcdefghij efghijlmnopq",
		"123456 456789",
		"1 1",
		"1 2",
	)

	for i := 0; i < 5; i++ {
		s1 := random.Str(chars.Alnum, 13)
		s2 := random.Str(chars.Alnum, 13) + s1 + random.Str(chars.Alnum, 13)
		args = append(args,
			s1+" "+s2,
			random.Str(chars.Alnum, 13)+" "+random.Str(chars.Alnum, 13),
		)
	}

	for _, s := range args {
		challenge.Program("inter", strings.Fields(s)...)
	}
}
