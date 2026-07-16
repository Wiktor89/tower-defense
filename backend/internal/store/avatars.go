package store

import "errors"

var AllowedAvatars = map[string]bool{
	"bunny":  true,
	"kitten": true,
	"puppy":  true,
	"fox":    true,
	"panda":  true,
}

func NormalizeAvatar(avatar string) (string, error) {
	if avatar == "" {
		return "", nil
	}
	if !AllowedAvatars[avatar] {
		return "", errors.New("unknown avatar")
	}
	return avatar, nil
}
