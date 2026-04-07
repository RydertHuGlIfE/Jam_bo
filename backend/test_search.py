list = ['qew', 'shuiga']



while True:
    print(list[0])
    list.pop(0)
    print(list[0])
    list.pop(0)
    try:
        print(list[0])
    except Exception as e:
        print("empty")
    break


