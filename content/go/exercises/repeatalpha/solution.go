package piscine

func RepeatAlpha(s string) string {
	res := ""
	for _, r := range s {
		n := 1
		if r >= 'a' && r <= 'z' {
			n = int(r-'a') + 1
		} else if r >= 'A' && r <= 'Z' {
			n = int(r-'A') + 1
		}
		for i := 0; i < n; i++ {
			res += string(r)
		}
	}
	return res
}
