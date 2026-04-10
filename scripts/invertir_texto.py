def invertir_texto(texto):
    return texto[::-1]


if __name__ == "__main__":
    texto = input("Ingrese un texto: ")
    print(f"Texto invertido: {invertir_texto(texto)}")
