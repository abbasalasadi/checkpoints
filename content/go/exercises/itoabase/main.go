package main

import (
	"fmt"
	"piscine"
)

func main() {
	fmt.Println(piscine.ItoaBase(125, 2))
	fmt.Println(piscine.ItoaBase(125, 8))
	fmt.Println(piscine.ItoaBase(125, 16))
	fmt.Println(piscine.ItoaBase(-125, 16))
	fmt.Println(piscine.ItoaBase(0, 10))
}
