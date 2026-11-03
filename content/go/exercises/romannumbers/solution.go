package main

import (
	"fmt"
	"os"
)

type roman struct {
	num        int
	romanDigit string
}

func atoi(s string) (int, bool) {
	i := 0
	sign := 1
	if len(s) > 0 && (s[0] == '-' || s[0] == '+') {
		if s[0] == '-' {
			sign = -1
		}
		i++
	}
	if i == len(s) {
		return 0, false
	}
	n := 0
	for ; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return 0, false
		}
		n = n*10 + int(s[i]-'0')
	}
	return sign * n, true
}

func convert(nbr int, patter []roman) (string, string) {
	var parts []string
	result := ""
	for _, v := range patter {
		for nbr >= v.num {
			parts = append(parts, v.romanDigit)
			result += v.romanDigit
			nbr -= v.num
		}
	}
	sum := ""
	for i, p := range parts {
		if i > 0 {
			sum += "+"
		}
		if len(p) == 2 {
			sum += "(" + p[1:2] + "-" + p[0:1] + ")"
		} else {
			sum += p
		}
	}
	return sum, result
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	nbr, ok := atoi(os.Args[1])
	if !ok || nbr >= 4000 || nbr == 0 {
		fmt.Printf("ERROR: cannot convert to roman digit\n")
		return
	}
	patter := []roman{
		{num: 1000, romanDigit: "M"},
		{num: 900, romanDigit: "CM"},
		{num: 500, romanDigit: "D"},
		{num: 400, romanDigit: "CD"},
		{num: 100, romanDigit: "C"},
		{num: 90, romanDigit: "XC"},
		{num: 50, romanDigit: "L"},
		{num: 40, romanDigit: "XL"},
		{num: 10, romanDigit: "X"},
		{num: 9, romanDigit: "IX"},
		{num: 5, romanDigit: "V"},
		{num: 4, romanDigit: "IV"},
		{num: 1, romanDigit: "I"},
	}
	sum, digits := convert(nbr, patter)
	fmt.Printf("%s\n%s\n", sum, digits)
}
