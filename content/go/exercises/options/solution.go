package main

import (
	"fmt"
	"os"
)

func isLetter(r rune) bool {
	return (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z')
}

func main() {
	if len(os.Args) < 2 {
		fmt.Println("options: abcdefghijklmnopqrstuvwxyz")
		return
	}

	var options [32]bool
	for _, v := range os.Args {
		if len(v) < 2 {
			fmt.Println("Invalid Option")
			return
		}
		if v[0] == '-' {
			if v[1] == 'h' {
				fmt.Println("options: abcdefghijklmnopqrstuvwxyz")
				return
			}
			for _, r := range v[1:] {
				if !isLetter(r) {
					fmt.Println("Invalid Option")
					return
				}
				options['z'-r+6] = true
			}
		}
	}
	for i, v := range options {
		if i%8 == 0 && i != 0 {
			fmt.Print(" ")
		}
		if v {
			fmt.Print(1)
		} else {
			fmt.Print(0)
		}
	}
	fmt.Println()
}
