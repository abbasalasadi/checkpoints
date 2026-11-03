package piscine

func LastWord(s string) string {
	last := ""
	word := ""
	for i := 0; i < len(s); i++ {
		if s[i] == ' ' || s[i] == '\t' || s[i] == '\n' {
			if word != "" {
				last = word
				word = ""
			}
			continue
		}
		word += s[i : i+1]
	}
	if word != "" {
		last = word
	}
	return last + "\n"
}
